-- WP-5: email (UI-05). Guest email goes through Resend on the product's own mail subdomain,
-- separate from marketing. A visit keeps one thread across SMS and email.
--
-- Outbound
--   queue_first_contacts()  (replaced) picks the channel for each visit's first contact:
--                           email for email threads, for guests who prefer email, and as the
--                           fallback while the church's text number isn't approved yet; SMS
--                           otherwise. Same template, consent, quiet hours and alerts as SMS.
--   claim_outbound(channel) one claim for both channels (claim_outbound_sms() now calls it).
--                           For email it also returns where and how to send it.
--   set_email_message_id()  stores the Message-ID Resend gave the email, so replies match it.
--
-- Inbound (Resend 'email.received' -> /api/email/webhook -> email_inbound_message())
--   A reply finds its thread by, in order: In-Reply-To / References against our Message-IDs;
--   the thread token in the reply address (reply+<token>@...); the subject, only when the
--   sender is that thread's guest. "unsubscribe" / "stop" revokes email consent.
--
-- email_event() records Resend's delivered / bounced / complained events; email_unsubscribe()
-- is the unsubscribe link. All functions are for the server (service role) only.

-- ---------------------------------------------------------------------------
-- Threads: email subject and token
-- ---------------------------------------------------------------------------
alter table public.church_threads
  -- "Welcome to Grace Church": replies keep it (Re: ...), the last-resort match.
  add column email_subject text check (length(email_subject) <= 300);

-- email_thread_key (WP-1) is the thread's random email token: the reply address
-- reply+<token>@<mail domain> and the unsubscribe link carry it. Looked up across churches.
create index church_threads_email_key_idx on public.church_threads (email_thread_key) where email_thread_key is not null;
create index church_messages_email_message_idx on public.church_messages (email_message_id) where email_message_id is not null;
create index church_messages_provider_idx on public.church_messages (provider_message_id) where provider_message_id is not null;

-- The thread's token, created on first use. 32 hex characters (122 random bits).
create or replace function public.thread_email_key(p_church uuid, p_thread uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  update public.church_threads
  set email_thread_key = coalesce(email_thread_key, replace(gen_random_uuid()::text, '-', ''))
  where church_id = p_church and id = p_thread
  returning email_thread_key into v_key;
  return v_key;
end;
$$;

-- ---------------------------------------------------------------------------
-- Which channel a first contact goes out on
-- ---------------------------------------------------------------------------
-- 'email' or 'sms' for the thread's first contact (null: no usable channel).
create or replace function public.first_contact_channel(p_church uuid, p_thread uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_thread     public.church_threads%rowtype;
  v_person     public.church_people%rowtype;
  v_email_ok   boolean;
  v_sms_ready  boolean;
begin
  select * into v_thread from public.church_threads where church_id = p_church and id = p_thread;
  select * into v_person from public.church_people where church_id = p_church and id = v_thread.person_id;
  v_email_ok := v_person.email is not null and public.person_consented(p_church, v_person.id, 'email');

  if v_thread.channel = 'email' then
    return 'email';
  end if;
  -- An SMS thread: email instead when the guest prefers it, or while the church can't text yet
  -- (number not approved by the carriers, or no guest number set up).
  v_sms_ready := exists (select 1 from public.church_integrations i where i.church_id = p_church and i.sms_status = 'approved')
             and exists (select 1 from public.church_sms_numbers n where n.church_id = p_church and n.active);
  if v_email_ok and (v_person.preferred_channel = 'email' or not v_sms_ready) then
    return 'email';
  end if;
  return 'sms';
end;
$$;

-- "Hi Ann! ... Reply STOP to opt out." -> the email version: no SMS opt-out line (every email
-- has an unsubscribe link instead).
create or replace function public.email_version_of(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(coalesce(p_text, ''), '\s*Reply STOP to (opt out|unsubscribe|stop)[^.!]*[.!]?', '', 'gi'));
$$;

-- ---------------------------------------------------------------------------
-- queue_first_contacts (replaces WP-4's): SMS or email
-- ---------------------------------------------------------------------------
create or replace function public.queue_first_contacts(p_now timestamptz default now(), p_limit int default 100)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r          record;
  v_channel  text;
  v_body     text;
  v_status   text;
  v_reason   text;
  v_after    timestamptz;
  v_quiet    timestamptz;
  v_id       uuid;
  v_n        int := 0;
begin
  for r in
    select t.id as thread_id, t.church_id, t.person_id, t.service_end_at, t.first_contact_due_at, t.channel,
           p.first_name, p.email, c.name as church_name, op.mode, tpl.body as template,
           (select m from unnest(coalesce(sp.ministries, '{}'::text[])) m where m ~* '(kid|child)' limit 1) as kids
    from public.church_threads t
    join public.churches c on c.id = t.church_id
    join public.onboarding_progress op on op.church_id = t.church_id and op.completed and op.mode in ('shadow', 'live')
    join public.church_first_message fm on fm.church_id = t.church_id and fm.status = 'approved'
    join public.church_message_templates tpl on tpl.church_id = t.church_id and tpl.client_id = fm.selected_template
    join public.church_people p on p.church_id = t.church_id and p.id = t.person_id
    left join public.church_site_profile sp on sp.church_id = t.church_id
    where t.status = 'open' and t.first_contact_sent_at is null
      and not exists (select 1 from public.church_messages m
                      where m.church_id = t.church_id and m.thread_id = t.id and m.purpose = 'first_contact')
    order by t.first_contact_due_at
    limit p_limit
    for update of t skip locked
  loop
    v_channel := public.first_contact_channel(r.church_id, r.thread_id);
    v_body := replace(replace(replace(r.template,
                '{first_name}', coalesce(nullif(btrim(r.first_name), ''), 'there')),
                '{church_name}', r.church_name),
                '{kids_ministry}', coalesce(r.kids, 'Kids Ministry'));
    if v_channel = 'email' then
      v_body := public.email_version_of(v_body);
      perform public.thread_email_key(r.church_id, r.thread_id);
      update public.church_threads set email_subject = coalesce(email_subject, left('Welcome to ' || r.church_name, 300))
      where church_id = r.church_id and id = r.thread_id;
    end if;

    v_reason := public.outbound_block_reason(r.church_id, r.thread_id, v_channel, 'assistant');
    if v_reason in ('do_not_contact', 'no_consent') then
      v_status := 'discarded';
    elsif r.mode = 'shadow' or v_reason is not null then
      v_status := 'held';
    else
      v_status := 'approved';
    end if;

    v_after := greatest(p_now, r.service_end_at);
    v_quiet := public.church_quiet_until(r.church_id, v_after);
    if v_quiet is not null then
      v_after := v_quiet;
    end if;

    insert into public.church_messages
      (church_id, thread_id, purpose, event_type, direction, sender, channel, body, status, failure_reason,
       send_after, event_at, received_at, source, source_event_id)
    values
      (r.church_id, r.thread_id, 'first_contact', 'message', 'outbound', 'assistant', v_channel, v_body, v_status,
       case when v_status = 'discarded' then 'blocked_' || v_reason end,
       v_after, p_now, p_now, 'app', 'first_contact:' || r.thread_id)
    returning id into v_id;

    insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, action, reason, details)
    values (r.church_id, r.thread_id, v_id, 'scheduler', 'first_contact.queued', v_reason,
            jsonb_build_object('status', v_status, 'mode', r.mode, 'channel', v_channel,
                               'fallback', v_channel = 'email' and r.channel = 'sms',
                               'send_after', v_after, 'quiet_hours', v_quiet is not null));

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
-- claim_outbound(channel): WP-4's claim for both channels
-- ---------------------------------------------------------------------------
-- email: { to, church_name, church_address, subject, reply_token, references: [Message-IDs
-- already on the thread, oldest first] } so the sender can write a threaded email.
create or replace function public.claim_outbound(
  p_channel text, p_now timestamptz default now(), p_limit int default 25, p_lease_seconds int default 120)
returns table (message_id uuid, church_id uuid, thread_id uuid, body text, conversation_sid text,
               attempt int, purpose text, email jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r        record;
  v_reason text;
  v_quiet  timestamptz;
begin
  if p_channel not in ('sms', 'email') then
    raise exception 'claim_outbound: unknown channel %', p_channel using errcode = '22023';
  end if;

  for r in
    select m.id, m.church_id, m.thread_id, m.body, m.sender, m.purpose, m.send_attempts,
           t.twilio_conversation_sid, t.first_contact_due_at, t.person_id, t.email_subject
    from public.church_messages m
    join public.church_threads t on t.church_id = m.church_id and t.id = m.thread_id
    where m.status = 'approved' and m.direction = 'outbound' and m.channel = p_channel and m.sent_at is null
      and (m.send_after is null or m.send_after <= p_now)
      and (m.lease_until is null or m.lease_until < p_now)
    order by m.send_after nulls first, m.created_at
    limit p_limit
    for update of m skip locked
  loop
    v_reason := public.outbound_block_reason(r.church_id, r.thread_id, p_channel, r.sender);
    if v_reason is null and p_channel = 'email'
       and (select p.email from public.church_people p where p.church_id = r.church_id and p.id = r.person_id) is null then
      v_reason := 'no_email';
    end if;
    if v_reason is not null then
      update public.church_messages
      set status = 'discarded', failure_reason = 'blocked_' || v_reason, lease_until = null
      where church_messages.church_id = r.church_id and id = r.id;
      insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, action, reason, details)
      values (r.church_id, r.thread_id, r.id, 'scheduler', 'message.blocked', v_reason, jsonb_build_object('channel', p_channel));
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
    email := null;
    if p_channel = 'email' then
      select jsonb_build_object(
        'to', p.email,
        'church_name', c.name,
        'church_address', coalesce(c.address, ''),
        'subject', coalesce(r.email_subject, 'A note from ' || c.name),
        'reply_token', public.thread_email_key(r.church_id, r.thread_id),
        'references', coalesce((
          select jsonb_agg(m.email_message_id order by m.event_at, m.seq)
          from public.church_messages m
          where m.church_id = r.church_id and m.thread_id = r.thread_id and m.email_message_id is not null), '[]'::jsonb))
      into email
      from public.church_people p
      join public.churches c on c.id = p.church_id
      where p.church_id = r.church_id and p.id = r.person_id;
    end if;
    return next;
  end loop;
end;
$$;

-- WP-4's SMS claim, kept for compatibility.
create or replace function public.claim_outbound_sms(
  p_now timestamptz default now(), p_limit int default 25, p_lease_seconds int default 120)
returns table (message_id uuid, church_id uuid, thread_id uuid, body text, conversation_sid text,
               attempt int, purpose text)
language sql
security definer
set search_path = ''
as $$
  select c.message_id, c.church_id, c.thread_id, c.body, c.conversation_sid, c.attempt, c.purpose
  from public.claim_outbound('sms', p_now, p_limit, p_lease_seconds) c;
$$;

-- ---------------------------------------------------------------------------
-- After sending an email
-- ---------------------------------------------------------------------------
-- The Message-ID Resend gave the email (from the send lookup or the email.sent webhook). Also
-- adds the guest as the thread's email participant, so the thread lists both channels.
create or replace function public.set_email_message_id(p_provider_id text, p_email_message_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg  public.church_messages%rowtype;
begin
  if p_email_message_id is null or p_email_message_id !~ '^<[^<>\s]+@[^<>\s]+>$' then
    raise exception 'set_email_message_id: invalid Message-ID' using errcode = '22023';
  end if;
  update public.church_messages
  set email_message_id = p_email_message_id
  where provider_message_id = p_provider_id and channel = 'email' and direction = 'outbound'
    and email_message_id is null
  returning * into v_msg;
  if v_msg.id is not null then
    perform public.ensure_email_participant(v_msg.church_id, v_msg.thread_id);
  end if;
end;
$$;

-- Adds or refreshes the guest's email participant on a thread.
create or replace function public.ensure_email_participant(p_church uuid, p_thread uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email  text;
  v_key    text;
  v_id     uuid;
begin
  select lower(p.email) into v_email
  from public.church_threads t join public.church_people p on p.church_id = t.church_id and p.id = t.person_id
  where t.church_id = p_church and t.id = p_thread;
  if v_email is null then
    return null;
  end if;
  v_key := public.thread_email_key(p_church, p_thread);
  insert into public.church_thread_participants (church_id, thread_id, kind, channel, address, church_address)
  values (p_church, p_thread, 'guest', 'email', v_email, 'reply+' || v_key)
  on conflict (church_id, thread_id, channel, address) where kind = 'guest' and active do nothing;
  select id into v_id from public.church_thread_participants
  where church_id = p_church and thread_id = p_thread and kind = 'guest' and channel = 'email' and address = v_email and active;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inbound email
-- ---------------------------------------------------------------------------
-- Message-ID list from In-Reply-To / References header values: '<a@x> <b@y>' -> {<a@x>,<b@y>}.
create or replace function public.email_message_ids(p_header text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(m[1]), '{}') from regexp_matches(coalesce(p_header, ''), '(<[^<>\s]+@[^<>\s]+>)', 'g') as m;
$$;

-- "Re: RE: Fwd: Welcome to Grace" -> "welcome to grace"
create or replace function public.email_base_subject(p_subject text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(regexp_replace(coalesce(p_subject, ''), '^(\s*(re|fw|fwd|aw|sv)\s*(\[\d+\])?\s*:\s*)+', '', 'i')));
$$;

-- p_email: { provider_id, message_id, from, to: [...], subject, text, in_reply_to, references, date }
-- text is the reply with quoted history already removed. Returns
-- { status: received | duplicate | unrouted, matched_by?, keyword?, church_id?, thread_id?, message_id? }.
create or replace function public.email_inbound_message(p_email jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from       text := lower(btrim(coalesce(substring(p_email->>'from' from '<([^<>]+)>'), p_email->>'from')));
  v_ids        text[] := public.email_message_ids(coalesce(p_email->>'in_reply_to', '') || ' ' || coalesce(p_email->>'references', ''));
  v_thread     public.church_threads%rowtype;
  v_matched    text;
  v_token      text;
  v_part       uuid;
  v_msg        uuid;
  v_at         timestamptz;
  v_keyword    text;
  v_provider   text := p_email->>'provider_id';
begin
  if v_provider is null or length(v_provider) > 200 then
    raise exception 'email_inbound_message: provider_id is missing or invalid' using errcode = '22023';
  end if;

  -- 1. In-Reply-To / References: one of our Message-IDs.
  if array_length(v_ids, 1) > 0 then
    select t.* into v_thread
    from public.church_messages m
    join public.church_threads t on t.church_id = m.church_id and t.id = m.thread_id
    where m.email_message_id = any (v_ids)
    order by m.event_at desc
    limit 1;
    if found then v_matched := 'headers'; end if;
  end if;

  -- 2. The thread token in the address it was sent to: reply+<token>@...
  if v_matched is null then
    select substring(a from '^reply\+([0-9a-f]{32})@') into v_token
    from jsonb_array_elements_text(coalesce(p_email->'to', '[]'::jsonb)) as a
    where a ~* '^reply\+[0-9a-f]{32}@'
    limit 1;
    if v_token is not null then
      select * into v_thread from public.church_threads where email_thread_key = lower(v_token) limit 1;
      if found then v_matched := 'reply_address'; end if;
    end if;
  end if;

  -- 3. Subject, only for the thread's own guest (most recent visit first).
  if v_matched is null and v_from is not null and public.email_base_subject(p_email->>'subject') <> '' then
    select t.* into v_thread
    from public.church_threads t
    join public.church_people p on p.church_id = t.church_id and p.id = t.person_id
    where lower(p.email) = v_from
      and public.email_base_subject(t.email_subject) = public.email_base_subject(p_email->>'subject')
    order by t.created_at desc
    limit 1;
    if found then v_matched := 'subject'; end if;
  end if;

  if v_matched is null then
    return jsonb_build_object('status', 'unrouted');
  end if;

  perform 1 from public.church_threads where church_id = v_thread.church_id and id = v_thread.id for update;

  select p.id into v_part from public.church_thread_participants p
  where p.church_id = v_thread.church_id and p.thread_id = v_thread.id and p.kind = 'guest'
    and p.channel = 'email' and p.address = v_from
  order by p.active desc limit 1;

  begin
    v_at := (p_email->>'date')::timestamptz;
  exception when others then
    v_at := null;
  end;

  -- "unsubscribe" or "stop" on its own (first line, or the subject) opts out of email.
  if public.sms_keyword(split_part(btrim(coalesce(p_email->>'text', '')), E'\n', 1)) = 'stop'
     or lower(btrim(coalesce(p_email->>'text', ''))) in ('unsubscribe', 'stop')
     or public.email_base_subject(p_email->>'subject') in ('unsubscribe', 'stop') then
    v_keyword := 'stop';
  end if;

  insert into public.church_messages
    (church_id, thread_id, participant_id, event_type, direction, sender, channel, body, status,
     provider_message_id, email_message_id, in_reply_to, event_at, source, source_event_id)
  values
    (v_thread.church_id, v_thread.id, v_part, case when v_keyword = 'stop' then 'opt_out' else 'message' end,
     'inbound', 'guest', 'email', left(coalesce(nullif(btrim(p_email->>'text'), ''), '(no text)'), 10000), 'received',
     v_provider, nullif(p_email->>'message_id', ''), v_ids[1], v_at, 'email', v_provider)
  on conflict (church_id, source, source_event_id) do nothing
  returning id into v_msg;

  if v_msg is null then
    select m.id into v_msg from public.church_messages m
    where m.church_id = v_thread.church_id and m.source = 'email' and m.source_event_id = v_provider;
    return jsonb_build_object('status', 'duplicate', 'church_id', v_thread.church_id, 'thread_id', v_thread.id, 'message_id', v_msg);
  end if;

  insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, action, details)
  values (v_thread.church_id, v_thread.id, v_msg, 'webhook', 'message.received',
          jsonb_build_object('provider', 'resend', 'matched_by', v_matched, 'keyword', v_keyword,
                             'from_guest', v_part is not null, 'thread_status', v_thread.status));

  if v_keyword = 'stop' then
    perform public.revoke_email_consent(v_thread.church_id, v_thread.id, 'guest_reply', v_provider);
  end if;

  return jsonb_build_object('status', 'received', 'matched_by', v_matched, 'keyword', v_keyword,
                            'church_id', v_thread.church_id, 'thread_id', v_thread.id, 'message_id', v_msg);
end;
$$;

-- Email opt-out: consent revoked (checked before every send), pending email to the guest
-- discarded, and an email-only thread closed. SMS is untouched (STOP by text handles that).
create or replace function public.revoke_email_consent(p_church uuid, p_thread uuid, p_source text, p_event_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public.church_threads%rowtype;
begin
  select * into v_thread from public.church_threads where church_id = p_church and id = p_thread;
  insert into public.church_consents (church_id, person_id, channel, status, source, source_event_id, event_at, received_at)
  values (p_church, v_thread.person_id, 'email', 'revoked',
          case when p_source in ('guest_reply', 'staff') then p_source else 'guest_reply' end,
          'email-optout:' || p_event_id, now(), clock_timestamp())
  on conflict (church_id, source, source_event_id) do nothing;

  update public.church_messages m
  set status = 'discarded', failure_reason = 'opted_out', lease_until = null
  from public.church_threads t
  where m.church_id = p_church and t.church_id = p_church and m.thread_id = t.id
    and t.person_id = v_thread.person_id and m.direction = 'outbound' and m.channel = 'email'
    and m.status in ('draft', 'held', 'approved');

  update public.church_threads set status = 'opted_out', closed_at = now()
  where church_id = p_church and id = p_thread and channel = 'email' and status = 'open';

  insert into public.church_audit_log (church_id, thread_id, actor_type, action, reason, details)
  values (p_church, p_thread, 'webhook', 'consent.revoked', left(p_source, 60),
          jsonb_build_object('channel', 'email', 'person_id', v_thread.person_id));
end;
$$;

-- The unsubscribe link: /api/email/unsubscribe?t=<thread token>. Returns the church name for
-- the confirmation page, or null for an unknown token.
create or replace function public.email_unsubscribe(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public.church_threads%rowtype;
  v_name   text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return null;
  end if;
  select * into v_thread from public.church_threads where email_thread_key = p_token limit 1;
  if not found then
    return null;
  end if;
  perform public.revoke_email_consent(v_thread.church_id, v_thread.id, 'guest_reply', 'link:' || p_token);
  select name into v_name from public.churches where id = v_thread.church_id;
  return v_name;
end;
$$;

-- Resend delivery events for an email we sent: delivered | bounced | complained.
-- Bounced -> failed + alert; complained (marked as spam) -> email consent revoked.
create or replace function public.email_event(p_provider_id text, p_type text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg public.church_messages%rowtype;
begin
  select * into v_msg from public.church_messages
  where provider_message_id = p_provider_id and channel = 'email' and direction = 'outbound'
  limit 1;
  if not found then
    return 'unknown';
  end if;

  if p_type = 'delivered' and v_msg.status = 'sent' then
    update public.church_messages set status = 'delivered' where id = v_msg.id;
  elsif p_type = 'bounced' and v_msg.status in ('sent', 'delivered') then
    update public.church_messages set status = 'failed', failure_reason = 'email_bounced' where id = v_msg.id;
    perform public.raise_church_alert(v_msg.church_id, v_msg.thread_id, v_msg.id, 'send_failed',
      jsonb_build_object('reason', 'email_bounced', 'purpose', v_msg.purpose));
  elsif p_type = 'complained' then
    perform public.revoke_email_consent(v_msg.church_id, v_msg.thread_id, 'guest_reply', 'complaint:' || p_provider_id);
  else
    return 'ignored';
  end if;

  insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, action, details)
  values (v_msg.church_id, v_msg.thread_id, v_msg.id, 'webhook', 'message.' || p_type, jsonb_build_object('provider', 'resend'));
  return p_type;
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
    'public.thread_email_key(uuid, uuid)',
    'public.first_contact_channel(uuid, uuid)',
    'public.queue_first_contacts(timestamptz, int)',
    'public.claim_outbound(text, timestamptz, int, int)',
    'public.claim_outbound_sms(timestamptz, int, int)',
    'public.set_email_message_id(text, text)',
    'public.ensure_email_participant(uuid, uuid)',
    'public.email_inbound_message(jsonb)',
    'public.revoke_email_consent(uuid, uuid, text, text)',
    'public.email_unsubscribe(text)',
    'public.email_event(text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
