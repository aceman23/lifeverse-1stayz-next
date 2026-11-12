-- WP-4: consent, STOP/HELP, quiet hours and the first-contact scheduler (UI-06, UI-06a, DB-05).
--
-- Outbound flow (all SMS for now; email is WP-5):
--   queue_first_contacts()   every open SMS thread gets one first-contact message, written from
--                            the church's approved template: 'approved' in Live, 'held' in Shadow
--                            (staff approve it, WP-6). Sent no earlier than the end of the service.
--   claim_outbound_sms()     the sender takes due 'approved' messages under a lease, re-checking
--                            the send gate and quiet hours right before sending.
--   mark_outbound_sent()     records the send; for a first contact, how long after the service
--   mark_outbound_failed()   it went out. Failures retry with backoff, then alert staff.
--
-- Inbound keywords (twilio_inbound_message, replaced here):
--   STOP etc.  opt-out: consent revoked, thread closed, pending messages discarded. Every later
--              send to the guest is refused by the send guard, so it survives restarts.
--   START etc. opt back in.      HELP/INFO  queues the church's help reply right away.
--
-- Quiet hours (church_team_settings, default 21:00-08:00) are in the church's time zone, which
-- stands in for the guest's. A deferral never silently pushes first contact past its deadline:
-- it raises a church_alerts row instead.
--
-- All functions here are for the server (service role) only.

-- ---------------------------------------------------------------------------
-- church_messages: purpose and sending state
-- ---------------------------------------------------------------------------
alter table public.church_messages
  add column purpose        text check (purpose in ('first_contact', 'help_reply', 'reply', 'follow_up')),
  -- Not before this time (end of service, end of quiet hours, retry backoff).
  add column send_after     timestamptz,
  -- A sender is working on it until then; another sender may take it after.
  add column lease_until    timestamptz,
  add column send_attempts  int not null default 0 check (send_attempts >= 0);

-- One first contact per thread, ever (a discarded one isn't replaced automatically).
create unique index church_messages_first_contact_key
  on public.church_messages (church_id, thread_id) where purpose = 'first_contact';
create index church_messages_due_idx
  on public.church_messages (send_after) where status = 'approved' and direction = 'outbound';

-- ---------------------------------------------------------------------------
-- church_alerts: things staff must know about (shown in the app in WP-6)
-- ---------------------------------------------------------------------------
create table public.church_alerts (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references public.churches (id) on delete cascade,
  thread_id    uuid,
  message_id   uuid,
  -- first_contact_late: first contact can't go out by its deadline (quiet hours, or a failure).
  -- send_failed:        a message failed for good.
  kind         text not null check (kind in ('first_contact_late', 'send_failed')),
  -- Ids and machine-readable reasons only, never guest details (guidelines 4.4, 4.5).
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users (id) on delete set null,
  foreign key (church_id, thread_id) references public.church_threads (church_id, id) on delete cascade
);

-- One open alert per thread and kind.
create unique index church_alerts_open_key
  on public.church_alerts (church_id, coalesce(thread_id, '00000000-0000-0000-0000-000000000000'::uuid), kind)
  where resolved_at is null;
create index church_alerts_church_open_idx on public.church_alerts (church_id, created_at desc) where resolved_at is null;

revoke all on public.church_alerts from anon, authenticated;
grant select on public.church_alerts to authenticated;
create policy "church_alerts: members can read" on public.church_alerts
  for select to authenticated using (public.is_church_member(church_id));

create or replace function public.raise_church_alert(
  p_church uuid, p_thread uuid, p_message uuid, p_kind text, p_details jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.church_alerts (church_id, thread_id, message_id, kind, details)
  values (p_church, p_thread, p_message, p_kind, coalesce(p_details, '{}'::jsonb))
  on conflict (church_id, coalesce(thread_id, '00000000-0000-0000-0000-000000000000'::uuid), kind)
    where resolved_at is null
  do nothing;
$$;

-- ---------------------------------------------------------------------------
-- Quiet hours
-- ---------------------------------------------------------------------------
-- If p_at falls in the church's quiet hours, when they end; otherwise null.
create or replace function public.church_quiet_until(p_church uuid, p_at timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz     text;
  v_start  time := '21:00';
  v_end    time := '08:00';
  v_local  timestamp;
  v_t      time;
  v_until  timestamp;
begin
  select c.timezone into v_tz from public.churches c where c.id = p_church;
  select coalesce(s.quiet_hours_start, v_start), coalesce(s.quiet_hours_end, v_end)
    into v_start, v_end
  from public.church_team_settings s where s.church_id = p_church;
  v_start := coalesce(v_start, '21:00');
  v_end := coalesce(v_end, '08:00');
  if v_start = v_end then
    return null;
  end if;

  v_local := p_at at time zone coalesce(v_tz, 'America/Chicago');
  v_t := v_local::time;
  if v_start > v_end then -- crosses midnight, e.g. 21:00-08:00
    if v_t >= v_start then
      v_until := (v_local::date + 1) + v_end;
    elsif v_t < v_end then
      v_until := v_local::date + v_end;
    end if;
  elsif v_t >= v_start and v_t < v_end then
    v_until := v_local::date + v_end;
  end if;
  return case when v_until is null then null else v_until at time zone coalesce(v_tz, 'America/Chicago') end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Consent and the send gate
-- ---------------------------------------------------------------------------
-- Latest consent for the channel is 'granted'.
create or replace function public.person_consented(p_church uuid, p_person uuid, p_channel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.status = 'granted' from public.church_consents c
    where c.church_id = p_church and c.person_id = p_person and c.channel = p_channel
    order by c.event_at desc, c.received_at desc
    limit 1), false);
$$;

-- Why an outbound message may not be sent now (null = it may). Shared by the sender's claim and
-- the send guard below.
create or replace function public.outbound_block_reason(p_church uuid, p_thread uuid, p_channel text, p_sender text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_thread  public.church_threads%rowtype;
  v_person  public.church_people%rowtype;
begin
  select * into v_thread from public.church_threads where church_id = p_church and id = p_thread;
  select * into v_person from public.church_people where church_id = p_church and id = v_thread.person_id;
  if v_thread.status <> 'open' then
    return 'thread_' || v_thread.status;
  end if;
  if v_person.do_not_contact then
    return 'do_not_contact';
  end if;
  if v_person.needs_review then
    return 'needs_review';
  end if;
  if p_channel in ('sms', 'email') and not public.person_consented(p_church, v_person.id, p_channel) then
    return 'no_consent';
  end if;
  if p_sender = 'assistant' and v_thread.handled_by <> 'assistant' then
    return 'handled_by_staff';
  end if;
  return null;
end;
$$;

-- The database's send guard (from WP-1), now with consent: an outbound message can't become
-- approved or sent unless outbound_block_reason() is null. The one exception is
-- mark_outbound_sent() recording a send that already happened at the provider (e.g. STOP
-- arrived while the text was in flight): it sets app.recording_send for its own transaction,
-- so the record matches what happened.
create or replace function public.church_messages_send_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
begin
  if new.direction <> 'outbound' or new.status not in ('approved', 'sent') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status in ('approved', 'sent', 'delivered') and new.status = old.status then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' and new.status = 'sent'
     and current_setting('app.recording_send', true) = 'on' then
    return new;
  end if;

  v_reason := public.outbound_block_reason(new.church_id, new.thread_id, new.channel, new.sender);
  if v_reason is not null then
    raise exception 'blocked_send: %', case v_reason
      when 'do_not_contact' then 'guest is marked do not contact'
      when 'needs_review' then 'guest identity needs review'
      when 'no_consent' then 'guest has not agreed to (or opted out of) this channel'
      when 'handled_by_staff' then 'thread is handled by staff'
      else 'thread is ' || substr(v_reason, 8) -- thread_closed -> "thread is closed"
    end using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- HELP text
-- ---------------------------------------------------------------------------
-- "Grace Church: for help, email hello@grace.org or call (555) 123-4567. Msg & data rates may
-- apply. Reply STOP to opt out." Contact from the SMS policy (step 4), else the church phone.
create or replace function public.church_sms_help_text(p_church uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left(
    c.name || ': for help, ' ||
    coalesce(
      nullif(concat_ws(' or ',
        case when p.contact_email is not null then 'email ' || p.contact_email end,
        case when nullif(c.phone, '') is not null then 'call ' || c.phone end), ''),
      'reply to this text and our team will get back to you') ||
    '. Msg & data rates may apply. Reply STOP to opt out.', 320)
  from public.churches c
  left join public.church_sms_policies p on p.church_id = c.id
  where c.id = p_church;
$$;

-- ---------------------------------------------------------------------------
-- Inbound: twilio_inbound_message with STOP / START / HELP
-- ---------------------------------------------------------------------------
-- Standard carrier keywords, matched on the whole message.
create or replace function public.sms_keyword(p_body text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case upper(regexp_replace(btrim(coalesce(p_body, '')), '[[:space:][:punct:]]+', '', 'g'))
    when 'STOP' then 'stop' when 'STOPALL' then 'stop' when 'UNSUBSCRIBE' then 'stop'
    when 'CANCEL' then 'stop' when 'END' then 'stop' when 'QUIT' then 'stop'
    when 'REVOKE' then 'stop' when 'OPTOUT' then 'stop'
    when 'START' then 'start' when 'UNSTOP' then 'start' when 'YES' then 'start'
    when 'HELP' then 'help' when 'INFO' then 'help'
  end;
$$;

-- p_event: { conversation_sid, message_sid, participant_sid, author, body, date_created, media_count }
-- Returns { status: received | duplicate | unrouted, keyword?: stop | start | help, church_id?,
--           thread_id?, message_id?, reply_id? }.
create or replace function public.twilio_inbound_message(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread       public.church_threads%rowtype;
  v_participant  uuid;
  v_message_id   uuid;
  v_reply_id     uuid;
  v_at           timestamptz;
  v_sid          text := p_event->>'message_sid';
  v_keyword      text := public.sms_keyword(p_event->>'body');
begin
  if v_sid is null or v_sid !~ '^IM[0-9a-fA-F]{32}$' then
    raise exception 'twilio_inbound_message: message_sid is missing or invalid' using errcode = '22023';
  end if;

  select * into v_thread from public.church_threads
  where twilio_conversation_sid = p_event->>'conversation_sid'
  for update;
  if not found then
    return jsonb_build_object('status', 'unrouted');
  end if;

  select p.id into v_participant
  from public.church_thread_participants p
  where p.church_id = v_thread.church_id and p.thread_id = v_thread.id and p.kind = 'guest'
    and (p.twilio_participant_sid = p_event->>'participant_sid'
         or (p.channel = 'sms' and p.address = public.us_phone_e164(p_event->>'author')))
  order by p.active desc, p.joined_at desc
  limit 1;

  begin
    v_at := (p_event->>'date_created')::timestamptz;
  exception when others then
    v_at := null; -- recorded with received_at and flagged clock_skew by the insert trigger
  end;

  insert into public.church_messages
    (church_id, thread_id, participant_id, event_type, direction, sender, channel, body,
     status, provider_message_id, event_at, source, source_event_id)
  values
    (v_thread.church_id, v_thread.id, v_participant,
     case v_keyword when 'stop' then 'opt_out' when 'start' then 'opt_in' when 'help' then 'help' else 'message' end,
     'inbound', 'guest', 'sms', left(coalesce(p_event->>'body', ''), 10000), 'received', v_sid, v_at, 'twilio', v_sid)
  on conflict (church_id, source, source_event_id) do nothing
  returning id into v_message_id;

  if v_message_id is null then
    select m.id into v_message_id from public.church_messages m
    where m.church_id = v_thread.church_id and m.source = 'twilio' and m.source_event_id = v_sid;
    return jsonb_build_object('status', 'duplicate', 'church_id', v_thread.church_id,
                              'thread_id', v_thread.id, 'message_id', v_message_id);
  end if;

  insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, action, details)
  values (v_thread.church_id, v_thread.id, v_message_id, 'webhook', 'message.received',
          jsonb_build_object('provider', 'twilio', 'message_sid', v_sid, 'keyword', v_keyword,
                             'media_count', coalesce((p_event->>'media_count')::int, 0),
                             'thread_status', v_thread.status));

  if v_keyword = 'stop' then
    -- Opt-out for this church's texts: consent revoked (checked before every send), this
    -- thread closed, and anything waiting to go to this guest by text discarded.
    insert into public.church_consents (church_id, person_id, channel, status, source, source_event_id, event_at, received_at)
    values (v_thread.church_id, v_thread.person_id, 'sms', 'revoked', 'twilio', v_sid, coalesce(v_at, now()), clock_timestamp())
    on conflict (church_id, source, source_event_id) do nothing;

    update public.church_threads set status = 'opted_out', closed_at = now()
    where church_id = v_thread.church_id and id = v_thread.id and status = 'open';

    update public.church_messages m
    set status = 'discarded', failure_reason = 'opted_out', lease_until = null
    from public.church_threads t
    where m.church_id = v_thread.church_id and m.thread_id = t.id and t.church_id = m.church_id
      and t.person_id = v_thread.person_id and m.direction = 'outbound' and m.channel = 'sms'
      and m.status in ('draft', 'held', 'approved');

    insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, action, reason, details)
    values (v_thread.church_id, v_thread.id, v_message_id, 'webhook', 'consent.revoked', 'stop',
            jsonb_build_object('channel', 'sms', 'person_id', v_thread.person_id));

  elsif v_keyword = 'start' then
    insert into public.church_consents (church_id, person_id, channel, status, source, source_event_id, event_at, received_at)
    values (v_thread.church_id, v_thread.person_id, 'sms', 'granted', 'twilio', v_sid, coalesce(v_at, now()), clock_timestamp())
    on conflict (church_id, source, source_event_id) do nothing;
    insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, action, reason, details)
    values (v_thread.church_id, v_thread.id, v_message_id, 'webhook', 'consent.granted', 'start',
            jsonb_build_object('channel', 'sms', 'person_id', v_thread.person_id));

  elsif v_keyword = 'help' and v_thread.status = 'open' then
    -- Answered right away, even in quiet hours: the guest just asked.
    begin
      insert into public.church_messages
        (church_id, thread_id, purpose, event_type, direction, sender, channel, body, status,
         send_after, event_at, source, source_event_id)
      values
        (v_thread.church_id, v_thread.id, 'help_reply', 'message', 'outbound', 'system', 'sms',
         public.church_sms_help_text(v_thread.church_id), 'approved', now(), now(), 'app', 'help:' || v_sid)
      returning id into v_reply_id;
    exception when check_violation then
      v_reply_id := null; -- the send guard refused it (e.g. no consent); nothing to send
    end;
  end if;

  return jsonb_build_object('status', 'received', 'keyword', v_keyword, 'church_id', v_thread.church_id,
                            'thread_id', v_thread.id, 'message_id', v_message_id, 'reply_id', v_reply_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- queue_first_contacts
-- ---------------------------------------------------------------------------
-- Writes the first contact for open SMS threads that don't have one yet, for churches that
-- finished onboarding with an approved first message. Returns how many were queued.
create or replace function public.queue_first_contacts(p_now timestamptz default now(), p_limit int default 100)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r         record;
  v_body    text;
  v_status  text;
  v_reason  text;
  v_after   timestamptz;
  v_quiet   timestamptz;
  v_id      uuid;
  v_n       int := 0;
begin
  for r in
    select t.id as thread_id, t.church_id, t.person_id, t.service_end_at, t.first_contact_due_at, t.handled_by,
           p.first_name, c.name as church_name, op.mode, tpl.body as template,
           (select m from unnest(coalesce(sp.ministries, '{}'::text[])) m where m ~* '(kid|child)' limit 1) as kids
    from public.church_threads t
    join public.churches c on c.id = t.church_id
    join public.onboarding_progress op on op.church_id = t.church_id and op.completed and op.mode in ('shadow', 'live')
    join public.church_first_message fm on fm.church_id = t.church_id and fm.status = 'approved'
    join public.church_message_templates tpl on tpl.church_id = t.church_id and tpl.client_id = fm.selected_template
    join public.church_people p on p.church_id = t.church_id and p.id = t.person_id
    left join public.church_site_profile sp on sp.church_id = t.church_id
    where t.status = 'open' and t.channel = 'sms' and t.first_contact_sent_at is null
      and not exists (select 1 from public.church_messages m
                      where m.church_id = t.church_id and m.thread_id = t.id and m.purpose = 'first_contact')
    order by t.first_contact_due_at
    limit p_limit
    for update of t skip locked
  loop
    v_body := replace(replace(replace(r.template,
                '{first_name}', coalesce(nullif(btrim(r.first_name), ''), 'there')),
                '{church_name}', r.church_name),
                '{kids_ministry}', coalesce(r.kids, 'Kids Ministry'));

    -- Not sendable at all: recorded as discarded with the reason, so staff can see why.
    v_reason := public.outbound_block_reason(r.church_id, r.thread_id, 'sms', 'assistant');
    if v_reason in ('do_not_contact', 'no_consent') then
      v_status := 'discarded';
    elsif r.mode = 'shadow' or v_reason is not null then
      v_status := 'held'; -- Shadow mode, identity review, or a staff-handled thread: staff decide
    else
      v_status := 'approved';
    end if;

    -- Never before the service ends, and never in quiet hours.
    v_after := greatest(p_now, r.service_end_at);
    v_quiet := public.church_quiet_until(r.church_id, v_after);
    if v_quiet is not null then
      v_after := v_quiet;
    end if;

    insert into public.church_messages
      (church_id, thread_id, purpose, event_type, direction, sender, channel, body, status, failure_reason,
       send_after, event_at, received_at, source, source_event_id)
    values
      (r.church_id, r.thread_id, 'first_contact', 'message', 'outbound', 'assistant', 'sms', v_body, v_status,
       case when v_status = 'discarded' then 'blocked_' || v_reason end,
       v_after, p_now, p_now, 'app', 'first_contact:' || r.thread_id)
    returning id into v_id;

    insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, action, reason, details)
    values (r.church_id, r.thread_id, v_id, 'scheduler', 'first_contact.queued', v_reason,
            jsonb_build_object('status', v_status, 'mode', r.mode, 'send_after', v_after,
                               'quiet_hours', v_quiet is not null));

    if v_status <> 'discarded' and v_after > r.first_contact_due_at then
      perform public.raise_church_alert(r.church_id, r.thread_id, v_id, 'first_contact_late',
        jsonb_build_object('reason', 'quiet_hours', 'due_at', r.first_contact_due_at, 'send_after', v_after));
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_outbound_sms
-- ---------------------------------------------------------------------------
-- Due 'approved' SMS for the sender, leased for p_lease_seconds so no other sender takes them.
-- Re-checks the gate (blocked -> discarded with the reason) and quiet hours (-> deferred; help
-- replies are exempt) first.
create or replace function public.claim_outbound_sms(
  p_now timestamptz default now(), p_limit int default 25, p_lease_seconds int default 120)
returns table (message_id uuid, church_id uuid, thread_id uuid, body text, conversation_sid text,
               attempt int, purpose text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r        record;
  v_reason text;
  v_quiet  timestamptz;
begin
  for r in
    select m.id, m.church_id, m.thread_id, m.body, m.sender, m.purpose, m.send_attempts,
           t.twilio_conversation_sid, t.first_contact_due_at
    from public.church_messages m
    join public.church_threads t on t.church_id = m.church_id and t.id = m.thread_id
    where m.status = 'approved' and m.direction = 'outbound' and m.channel = 'sms' and m.sent_at is null
      and (m.send_after is null or m.send_after <= p_now)
      and (m.lease_until is null or m.lease_until < p_now)
    order by m.send_after nulls first, m.created_at
    limit p_limit
    for update of m skip locked
  loop
    v_reason := public.outbound_block_reason(r.church_id, r.thread_id, 'sms', r.sender);
    if v_reason is not null then
      update public.church_messages
      set status = 'discarded', failure_reason = 'blocked_' || v_reason, lease_until = null
      where church_messages.church_id = r.church_id and id = r.id;
      insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, action, reason, details)
      values (r.church_id, r.thread_id, r.id, 'scheduler', 'message.blocked', v_reason, '{}'::jsonb);
      continue;
    end if;

    if r.purpose is distinct from 'help_reply' then
      v_quiet := public.church_quiet_until(r.church_id, p_now);
      if v_quiet is not null then
        update public.church_messages set send_after = v_quiet
        where church_messages.church_id = r.church_id and id = r.id;
        if r.purpose = 'first_contact' and v_quiet > r.first_contact_due_at then
          perform public.raise_church_alert(r.church_id, r.thread_id, r.id, 'first_contact_late',
            jsonb_build_object('reason', 'quiet_hours', 'due_at', r.first_contact_due_at, 'send_after', v_quiet));
        end if;
        continue;
      end if;
    end if;

    update public.church_messages
    set lease_until = p_now + make_interval(secs => p_lease_seconds), send_attempts = send_attempts + 1
    where church_messages.church_id = r.church_id and id = r.id;

    message_id := r.id;
    church_id := r.church_id;
    thread_id := r.thread_id;
    body := r.body;
    conversation_sid := r.twilio_conversation_sid;
    attempt := r.send_attempts + 1;
    purpose := r.purpose;
    return next;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_outbound_sent / mark_outbound_failed
-- ---------------------------------------------------------------------------
create or replace function public.mark_outbound_sent(p_message_id uuid, p_provider_id text, p_sent_at timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg     public.church_messages%rowtype;
  v_thread  public.church_threads%rowtype;
  v_latency int;
begin
  select * into v_msg from public.church_messages where id = p_message_id for update;
  if not found then
    raise exception 'mark_outbound_sent: message not found' using errcode = 'P0002';
  end if;
  if v_msg.status in ('sent', 'delivered') then
    return; -- already recorded
  end if;

  -- The provider has sent it: record that even if the gate has closed since (see the guard).
  perform set_config('app.recording_send', 'on', true);
  update public.church_messages
  set status = 'sent', sent_at = p_sent_at, provider_message_id = p_provider_id, lease_until = null, failure_reason = null
  where id = p_message_id;
  perform set_config('app.recording_send', 'off', true);

  select * into v_thread from public.church_threads where church_id = v_msg.church_id and id = v_msg.thread_id;
  if v_msg.purpose = 'first_contact' then
    update public.church_threads set first_contact_sent_at = p_sent_at
    where church_id = v_msg.church_id and id = v_msg.thread_id and first_contact_sent_at is null;
    v_latency := round(extract(epoch from (p_sent_at - v_thread.service_end_at)));
    -- Sent after all: the "late" alert stays for the record but is resolved if it went out on time.
    if p_sent_at <= v_thread.first_contact_due_at then
      update public.church_alerts set resolved_at = now()
      where church_id = v_msg.church_id and thread_id = v_msg.thread_id and kind = 'first_contact_late'
        and resolved_at is null;
    end if;
  end if;

  insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, action, details)
  values (v_msg.church_id, v_msg.thread_id, p_message_id, 'scheduler', 'message.sent',
          jsonb_build_object('provider_id', p_provider_id, 'purpose', v_msg.purpose, 'attempts', v_msg.send_attempts)
          || case when v_msg.purpose = 'first_contact' then
               jsonb_build_object('first_contact_latency_s', v_latency,
                                  'on_time', p_sent_at <= v_thread.first_contact_due_at)
             else '{}'::jsonb end);
end;
$$;

-- p_reason: machine-readable (e.g. 'twilio_21610'). Retryable failures go again after 2, 4
-- minutes; the third failure (or a non-retryable one) is final and alerts staff.
create or replace function public.mark_outbound_failed(
  p_message_id uuid, p_reason text, p_retryable boolean, p_now timestamptz default now())
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg     public.church_messages%rowtype;
  v_thread  public.church_threads%rowtype;
begin
  select * into v_msg from public.church_messages where id = p_message_id for update;
  if not found then
    raise exception 'mark_outbound_failed: message not found' using errcode = 'P0002';
  end if;
  if v_msg.status <> 'approved' then
    return v_msg.status;
  end if;

  if p_retryable and v_msg.send_attempts < 3 then
    update public.church_messages
    set lease_until = null, failure_reason = left(p_reason, 200),
        send_after = p_now + make_interval(mins => 2 * greatest(v_msg.send_attempts, 1))
    where id = p_message_id;
    insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, action, reason, details)
    values (v_msg.church_id, v_msg.thread_id, p_message_id, 'scheduler', 'message.retry', left(p_reason, 60),
            jsonb_build_object('attempts', v_msg.send_attempts));
    return 'retry';
  end if;

  update public.church_messages
  set status = 'failed', failure_reason = left(p_reason, 200), lease_until = null
  where id = p_message_id;
  insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, action, reason, details)
  values (v_msg.church_id, v_msg.thread_id, p_message_id, 'scheduler', 'message.failed', left(p_reason, 60),
          jsonb_build_object('attempts', v_msg.send_attempts, 'purpose', v_msg.purpose));
  perform public.raise_church_alert(v_msg.church_id, v_msg.thread_id, p_message_id, 'send_failed',
    jsonb_build_object('reason', left(p_reason, 200), 'purpose', v_msg.purpose));
  if v_msg.purpose = 'first_contact' then
    select * into v_thread from public.church_threads where church_id = v_msg.church_id and id = v_msg.thread_id;
    perform public.raise_church_alert(v_msg.church_id, v_msg.thread_id, p_message_id, 'first_contact_late',
      jsonb_build_object('reason', 'send_failed', 'due_at', v_thread.first_contact_due_at));
  end if;
  return 'failed';
end;
$$;

-- ---------------------------------------------------------------------------
-- First-contact timing per visit: sent_at - service_end_at (DB-05)
-- ---------------------------------------------------------------------------
create view public.church_first_contact_stats
with (security_invoker = true) as
select t.church_id, t.id as thread_id, t.visit_id, t.channel, t.service_end_at, t.first_contact_due_at,
       t.first_contact_sent_at,
       round(extract(epoch from (t.first_contact_sent_at - t.service_end_at)))::int as latency_s,
       t.first_contact_sent_at <= t.first_contact_due_at as on_time
from public.church_threads t;

revoke all on public.church_first_contact_stats from anon;
grant select on public.church_first_contact_stats to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Go-live needs a service schedule (first contact is timed from the service end)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_live_mode_approvals()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.mode = 'live' and (tg_op = 'INSERT' or old.mode is distinct from 'live') then
    if not exists (
      select 1 from public.church_guardrails g
      where g.church_id = new.church_id and g.approved_at is not null
    ) then
      raise exception 'Live mode needs the guardrails approved by your pastor first.' using errcode = '23514';
    end if;

    if not exists (
      select 1 from public.church_first_message f
      where f.church_id = new.church_id and f.status = 'approved'
    ) then
      raise exception 'Live mode needs the first message approved by your pastor first.' using errcode = '23514';
    end if;

    if not exists (
      select 1 from public.church_services s
      where s.church_id = new.church_id and s.start_time is not null and s.end_time is not null
    ) then
      raise exception 'Live mode needs your service schedule first: first texts are timed from when a service ends.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: the server only
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.raise_church_alert(uuid, uuid, uuid, text, jsonb)',
    'public.church_quiet_until(uuid, timestamptz)',
    'public.person_consented(uuid, uuid, text)',
    'public.outbound_block_reason(uuid, uuid, text, text)',
    'public.church_sms_help_text(uuid)',
    'public.queue_first_contacts(timestamptz, int)',
    'public.claim_outbound_sms(timestamptz, int, int)',
    'public.mark_outbound_sent(uuid, text, timestamptz)',
    'public.mark_outbound_failed(uuid, text, boolean, timestamptz)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
revoke execute on function public.church_messages_send_guard() from public, anon, authenticated;
revoke execute on function public.twilio_inbound_message(jsonb) from public, anon, authenticated;
grant execute on function public.twilio_inbound_message(jsonb) to service_role;
