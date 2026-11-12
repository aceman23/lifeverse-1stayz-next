-- WP-6: the staff inbox, escalation queue, Today list and Shadow approval (UI-07, UI-08, UI-09;
-- pilot plan P10, P11, P12).
--
-- Staff act through the functions below, signed in as themselves (auth.uid()). Each one checks
-- that the conversation belongs to the caller's church, takes the thread lock, and writes an
-- audit row. The send guard and outbound_block_reason() still decide what may be sent.
--
--   staff_send_reply()       a staff reply in the thread (P10). The thread moves to staff (the
--                            assistant goes quiet), the assistant's unsent drafts are discarded
--                            (no double text), and an open escalation is marked answered:
--                            time to human = answered - escalated (SOW S5).
--   staff_approve_message()  Shadow mode: approve (optionally edited) or discard a held message.
--   staff_discard_message()  The approval delay goes into the audit row.
--   staff_take_over() / staff_release_thread() / staff_escalate() / staff_assign_thread()
--   staff_followup()         Today list: done, not a priority, snooze, undo, coming back.
--   staff_resolve_alert()
--
-- church_inbox (view, read with the caller's RLS) gives one row per thread with its latest
-- message and the reason it needs someone, if any (the leader-list bucket).
--
-- Staff replies skip quiet hours: those are for automated texts (claim_outbound, replaced
-- below). Everything else about sending is unchanged.

-- ---------------------------------------------------------------------------
-- church_threads: assignment, escalation answer, Today follow-up state
-- ---------------------------------------------------------------------------
alter table public.church_threads
  add column assigned_to             uuid references auth.users (id) on delete set null,
  -- Who marked it as needing a pastor; null when the assistant or a webhook did.
  add column escalated_by            uuid references auth.users (id) on delete set null,
  -- First staff reply after the escalation (time to human).
  add column escalation_answered_at  timestamptz,
  add column escalation_answered_by  uuid references auth.users (id) on delete set null,
  -- Today list: a staff member handled it, or said it isn't a priority (with a reason). It
  -- comes back when the guest writes again or we send again.
  add column followup_state          text check (followup_state in ('done', 'not_priority')),
  add column followup_reason         text check (length(followup_reason) <= 60),
  add column followup_at             timestamptz,
  add column followup_by             uuid references auth.users (id) on delete set null,
  add column snoozed_until           timestamptz,
  -- The guest said they'll be back (set by staff; later also by the assistant).
  add column coming_back_on          date,
  add constraint church_threads_answer_needs_escalation
    check (escalation_answered_at is null or escalated_at is not null),
  add constraint church_threads_followup_complete
    check ((followup_state is null) = (followup_at is null));

create index church_threads_open_escalation_idx on public.church_threads (church_id, escalated_at)
  where escalated_at is not null and escalation_answered_at is null;

-- ---------------------------------------------------------------------------
-- Helpers (not callable by the API roles)
-- ---------------------------------------------------------------------------
-- The thread, locked, if it belongs to the caller's church. Same error for "doesn't exist"
-- and "another church's", so ids can't be probed.
create or replace function public.staff_lock_thread(p_thread uuid)
returns public.church_threads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.church_threads%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  select * into v from public.church_threads where id = p_thread for update;
  if not found or not public.is_church_member(v.church_id) then
    raise exception 'This conversation was not found.' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

-- A thread event (takeover, release, escalation) in the transcript.
create or replace function public.staff_thread_event(p_church uuid, p_thread uuid, p_type text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.church_messages
    (church_id, thread_id, event_type, direction, sender, sender_user_id, channel, status, event_at, source, data_class)
  values (p_church, p_thread, p_type, 'internal', 'staff', auth.uid(), 'app', 'logged', now(), 'app', 'C2');
$$;

-- What to tell staff when outbound_block_reason() refuses a send.
create or replace function public.staff_block_message(p_reason text, p_channel text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_reason
    when 'thread_opted_out' then 'This guest replied STOP, so nothing more can be sent on this conversation.'
    when 'thread_closed'    then 'This conversation is closed.'
    when 'do_not_contact'   then 'This guest is marked do not contact.'
    when 'needs_review'     then 'Confirm who this guest is first (open their profile): they may be the same person as another guest.'
    when 'no_consent'       then case p_channel when 'sms' then 'This guest hasn''t agreed to text messages.'
                                                else 'This guest hasn''t agreed to email.' end
    when 'handled_by_staff' then 'Your team has taken over this conversation, so the assistant''s draft can''t be sent. Send it as your own reply instead.'
    else 'This message can''t be sent right now.'
  end;
$$;

-- Unsent assistant drafts on a thread become stale once staff step in (no double text).
create or replace function public.staff_discard_drafts(p_church uuid, p_thread uuid, p_reason text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.church_messages
  set status = 'discarded', failure_reason = p_reason
  where church_id = p_church and thread_id = p_thread
    and sender = 'assistant' and direction = 'outbound' and status in ('draft', 'held');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff reply in the thread (P10)
-- ---------------------------------------------------------------------------
-- p_channel: 'sms' or 'email'; null = the channel the guest last wrote on (else the thread's).
-- p_request_id makes a retried submit return the same message instead of sending twice.
create or replace function public.staff_send_reply(
  p_thread uuid, p_body text, p_channel text default null, p_request_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v          public.church_threads%rowtype;
  v_body     text := btrim(p_body);
  v_channel  text;
  v_reason   text;
  v_id       uuid;
  v_dropped  int;
  v_event    text := 'staff_reply:' || coalesce(p_request_id, gen_random_uuid())::text;
begin
  v := public.staff_lock_thread(p_thread);

  if p_request_id is not null then
    select m.id into v_id from public.church_messages m
    where m.church_id = v.church_id and m.source = 'app' and m.source_event_id = v_event;
    if found then
      return v_id;
    end if;
  end if;

  if v_body is null or v_body = '' then
    raise exception 'Write a message first.' using errcode = '22023';
  end if;

  v_channel := coalesce(p_channel, (
    select m.channel from public.church_messages m
    where m.church_id = v.church_id and m.thread_id = v.id and m.direction = 'inbound'
      and m.event_type = 'message' and m.channel in ('sms', 'email')
    order by m.event_at desc, m.seq desc
    limit 1), v.channel);
  if v_channel not in ('sms', 'email') then
    raise exception 'Choose text or email.' using errcode = '22023';
  end if;
  if v_channel = 'sms' and length(v_body) > 1600 then
    raise exception 'Keep texts to 1,600 characters or fewer.' using errcode = '22023';
  end if;
  if length(v_body) > 10000 then
    raise exception 'Keep emails to 10,000 characters or fewer.' using errcode = '22023';
  end if;

  v_reason := public.outbound_block_reason(v.church_id, v.id, v_channel, 'staff');
  if v_reason is not null then
    raise exception '%', public.staff_block_message(v_reason, v_channel) using errcode = '23514';
  end if;
  if v_channel = 'email' and public.ensure_email_participant(v.church_id, v.id) is null then
    raise exception 'This guest has no email address.' using errcode = '23514';
  end if;

  if v.handled_by = 'assistant' then
    update public.church_threads set handled_by = 'staff' where id = v.id;
    perform public.staff_thread_event(v.church_id, v.id, 'takeover');
  end if;
  v_dropped := public.staff_discard_drafts(v.church_id, v.id, 'staff_replied');

  insert into public.church_messages
    (church_id, thread_id, event_type, direction, sender, sender_user_id, channel, body, status,
     approved_by, approved_at, purpose, send_after, event_at, source, source_event_id)
  values
    (v.church_id, v.id, 'message', 'outbound', 'staff', auth.uid(), v_channel, v_body, 'approved',
     auth.uid(), now(), 'reply', now(), now(), 'app', v_event)
  returning id into v_id;

  insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, actor_user_id, action, details)
  values (v.church_id, v.id, v_id, 'staff', auth.uid(), 'message.staff_reply',
          jsonb_build_object('channel', v_channel, 'discarded_drafts', v_dropped));

  if v.escalated_at is not null and v.escalation_answered_at is null then
    update public.church_threads
    set escalation_answered_at = now(), escalation_answered_by = auth.uid()
    where id = v.id;
    insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, actor_user_id, action, details)
    values (v.church_id, v.id, v_id, 'staff', auth.uid(), 'escalation.answered',
            jsonb_build_object('time_to_human_s', round(extract(epoch from (now() - v.escalated_at)))::int));
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shadow mode: approve or discard held messages
-- ---------------------------------------------------------------------------
-- p_body: the edited text, or null to send it as written.
create or replace function public.staff_approve_message(p_message uuid, p_body text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v       public.church_threads%rowtype;
  m       public.church_messages%rowtype;
  v_body  text;
  v_reason text;
begin
  select * into m from public.church_messages where id = p_message;
  if not found then
    raise exception 'This draft was not found.' using errcode = 'P0002';
  end if;
  v := public.staff_lock_thread(m.thread_id);
  select * into m from public.church_messages where id = p_message for update;

  if m.direction <> 'outbound' or m.status <> 'held' then
    raise exception 'Someone already handled this draft.' using errcode = '55000';
  end if;

  v_body := coalesce(nullif(btrim(p_body), ''), m.body);
  if m.channel = 'sms' and length(v_body) > 1600 then
    raise exception 'Keep texts to 1,600 characters or fewer.' using errcode = '22023';
  end if;
  if length(v_body) > 10000 then
    raise exception 'Keep emails to 10,000 characters or fewer.' using errcode = '22023';
  end if;

  v_reason := public.outbound_block_reason(v.church_id, v.id, m.channel, m.sender);
  if v_reason is not null then
    raise exception '%', public.staff_block_message(v_reason, m.channel) using errcode = '23514';
  end if;

  update public.church_messages
  set body = v_body, status = 'approved', approved_by = auth.uid(), approved_at = now()
  where id = m.id;

  insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, actor_user_id, action, details)
  values (v.church_id, v.id, m.id, 'staff', auth.uid(), 'message.approved',
          jsonb_build_object('purpose', m.purpose, 'edited', v_body is distinct from m.body,
                             'approval_delay_s', round(extract(epoch from (now() - m.created_at)))::int));
end;
$$;

create or replace function public.staff_discard_message(p_message uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v  public.church_threads%rowtype;
  m  public.church_messages%rowtype;
begin
  select * into m from public.church_messages where id = p_message;
  if not found then
    raise exception 'This draft was not found.' using errcode = 'P0002';
  end if;
  v := public.staff_lock_thread(m.thread_id);
  select * into m from public.church_messages where id = p_message for update;
  if m.direction <> 'outbound' or m.status not in ('held', 'draft') then
    raise exception 'Someone already handled this draft.' using errcode = '55000';
  end if;

  update public.church_messages set status = 'discarded', failure_reason = 'staff_discarded' where id = m.id;
  insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, actor_user_id, action, details)
  values (v.church_id, v.id, m.id, 'staff', auth.uid(), 'message.discarded',
          jsonb_build_object('purpose', m.purpose,
                             'approval_delay_s', round(extract(epoch from (now() - m.created_at)))::int));
end;
$$;

-- ---------------------------------------------------------------------------
-- Who handles the thread
-- ---------------------------------------------------------------------------
create or replace function public.staff_take_over(p_thread uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v        public.church_threads%rowtype;
  v_count  int;
begin
  v := public.staff_lock_thread(p_thread);
  if v.handled_by = 'staff' then
    return;
  end if;
  update public.church_threads set handled_by = 'staff' where id = v.id;
  perform public.staff_thread_event(v.church_id, v.id, 'takeover');
  v_count := public.staff_discard_drafts(v.church_id, v.id, 'staff_took_over');
  insert into public.church_audit_log (church_id, thread_id, actor_type, actor_user_id, action, details)
  values (v.church_id, v.id, 'staff', auth.uid(), 'thread.taken_over', jsonb_build_object('discarded_drafts', v_count));
end;
$$;

create or replace function public.staff_release_thread(p_thread uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.church_threads%rowtype;
begin
  v := public.staff_lock_thread(p_thread);
  if v.status <> 'open' then
    raise exception 'This conversation is closed.' using errcode = '55000';
  end if;
  if v.escalated_at is not null and v.escalation_answered_at is null then
    raise exception 'Reply to the guest first: a conversation that needs a pastor stays with your team until someone answers.'
      using errcode = '55000';
  end if;
  if v.handled_by = 'assistant' then
    return;
  end if;
  update public.church_threads set handled_by = 'assistant' where id = v.id;
  perform public.staff_thread_event(v.church_id, v.id, 'release');
  insert into public.church_audit_log (church_id, thread_id, actor_type, actor_user_id, action)
  values (v.church_id, v.id, 'staff', auth.uid(), 'thread.released');
end;
$$;

-- Staff mark a conversation as needing a pastor. The assistant goes quiet until someone replies.
-- p_reason is a category, never the guest's words.
create or replace function public.staff_escalate(p_thread uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.church_threads%rowtype;
begin
  v := public.staff_lock_thread(p_thread);
  if p_reason is null or p_reason not in ('care', 'crisis', 'theology', 'meet_pastor', 'other') then
    raise exception 'Choose why this needs a pastor.' using errcode = '22023';
  end if;
  if v.status <> 'open' then
    raise exception 'This conversation is closed.' using errcode = '55000';
  end if;
  if v.escalated_at is not null and v.escalation_answered_at is null then
    return;
  end if;

  update public.church_threads
  set escalated_at = now(), escalation_reason = p_reason, escalated_by = auth.uid(),
      escalation_answered_at = null, escalation_answered_by = null, handled_by = 'staff',
      followup_state = null, followup_reason = null, followup_at = null, followup_by = null, snoozed_until = null
  where id = v.id;
  perform public.staff_thread_event(v.church_id, v.id, 'escalation');
  perform public.staff_discard_drafts(v.church_id, v.id, 'escalated');
  insert into public.church_audit_log (church_id, thread_id, actor_type, actor_user_id, action, reason)
  values (v.church_id, v.id, 'staff', auth.uid(), 'thread.escalated', p_reason);
end;
$$;

-- p_user: a staff account of the same church, or null to unassign.
create or replace function public.staff_assign_thread(p_thread uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.church_threads%rowtype;
begin
  v := public.staff_lock_thread(p_thread);
  if p_user is not null and not exists (
    select 1 from public.church_members m where m.church_id = v.church_id and m.user_id = p_user
  ) then
    raise exception 'Choose someone on your team.' using errcode = '22023';
  end if;
  update public.church_threads set assigned_to = p_user where id = v.id;
  insert into public.church_audit_log (church_id, thread_id, actor_type, actor_user_id, action, details)
  values (v.church_id, v.id, 'staff', auth.uid(), 'thread.assigned', jsonb_build_object('assigned_to', p_user));
end;
$$;

-- ---------------------------------------------------------------------------
-- Today list follow-up
-- ---------------------------------------------------------------------------
-- p_action: 'done' | 'not_priority' (with p_reason) | 'snooze' (until p_until) | 'undo'
--           | 'coming_back' (on p_on) | 'welcomed' (clears coming back).
-- An open escalation can't be dismissed or snoozed: someone has to answer it.
create or replace function public.staff_followup(
  p_thread uuid, p_action text, p_reason text default null, p_until timestamptz default null, p_on date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.church_threads%rowtype;
begin
  v := public.staff_lock_thread(p_thread);
  if p_action in ('done', 'not_priority', 'snooze') and v.escalated_at is not null and v.escalation_answered_at is null then
    raise exception 'A conversation that needs a pastor can''t be dismissed. Reply to the guest or assign it to someone.'
      using errcode = '55000';
  end if;
  if length(p_reason) > 60 then
    raise exception 'Keep the reason short.' using errcode = '22023';
  end if;

  case p_action
    when 'done', 'not_priority' then
      update public.church_threads
      set followup_state = p_action, followup_reason = nullif(btrim(p_reason), ''), followup_at = now(),
          followup_by = auth.uid(), snoozed_until = null
      where id = v.id;
    when 'snooze' then
      if p_until is null or p_until <= now() or p_until > now() + interval '31 days' then
        raise exception 'Choose when to bring this back (up to a month).' using errcode = '22023';
      end if;
      update public.church_threads set snoozed_until = p_until where id = v.id;
    when 'undo' then
      update public.church_threads
      set followup_state = null, followup_reason = null, followup_at = null, followup_by = null, snoozed_until = null
      where id = v.id;
    when 'coming_back' then
      if p_on is null or p_on < current_date - 1 or p_on > current_date + 60 then
        raise exception 'Choose the date they''re coming back.' using errcode = '22023';
      end if;
      update public.church_threads set coming_back_on = p_on where id = v.id;
    when 'welcomed' then
      update public.church_threads set coming_back_on = null where id = v.id;
    else
      raise exception 'Unknown action.' using errcode = '22023';
  end case;

  insert into public.church_audit_log (church_id, thread_id, actor_type, actor_user_id, action, reason)
  values (v.church_id, v.id, 'staff', auth.uid(), 'thread.followup', p_action);
end;
$$;

create or replace function public.staff_resolve_alert(p_alert uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.church_alerts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  select * into a from public.church_alerts where id = p_alert for update;
  if not found or not public.is_church_member(a.church_id) then
    raise exception 'This alert was not found.' using errcode = 'P0002';
  end if;
  if a.resolved_at is not null then
    return;
  end if;
  update public.church_alerts set resolved_at = now(), resolved_by = auth.uid() where id = a.id;
  insert into public.church_audit_log (church_id, thread_id, actor_type, actor_user_id, action, reason)
  values (a.church_id, a.thread_id, 'staff', auth.uid(), 'alert.resolved', a.kind);
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff replies skip quiet hours (WP-5's claim_outbound, one condition changed)
-- ---------------------------------------------------------------------------
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

    -- Quiet hours hold automated messages only: HELP replies and a person's own reply go now.
    if r.purpose is distinct from 'help_reply' and r.sender <> 'staff' then
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

-- ---------------------------------------------------------------------------
-- church_inbox: one row per thread for the inbox, Today and the leader list
-- ---------------------------------------------------------------------------
-- attention: why the thread needs someone now, highest first (null = it doesn't):
--   escalation       marked as needing a pastor and no staff reply yet (never snoozed)
--   review           the guest may be the same person as another guest; nothing can be sent
--                    (or approved) until staff confirm who they are
--   draft_ready      a message waiting for staff approval (Shadow mode)
--   replied          the guest wrote after our last message
--   coming_back      the guest said they'll be back (today or later)
--   at_risk          no reply 5+ days after our last message
--   needs_follow_up  no reply 2-5 days after our last message
-- The last four are hidden while snoozed, or after staff mark them done / not a priority until
-- the guest writes again or we send again.
create view public.church_inbox
with (security_invoker = true) as
select
  t.id as thread_id, t.church_id, t.person_id, t.visit_id, t.channel, t.status, t.handled_by,
  t.escalated_at, t.escalation_reason, t.escalated_by, t.escalation_answered_at, t.escalation_answered_by,
  t.assigned_to, t.service_end_at, t.first_contact_due_at, t.first_contact_sent_at,
  t.followup_state, t.followup_reason, t.followup_at, t.snoozed_until, t.coming_back_on,
  t.last_event_at, t.created_at,
  p.first_name, p.last_name, p.phone, p.email, p.needs_review, p.do_not_contact, p.visit_count,
  v.visited_at, v.service_name,
  li.last_inbound_at, lo.last_outbound_at,
  lm.id as last_message_id, lm.sender as last_message_sender, lm.body as last_message_body,
  lm.event_at as last_message_at, lm.channel as last_message_channel, lm.status as last_message_status,
  coalesce(h.held_count, 0)::int as held_count, h.held_message_id, h.oldest_held_at,
  case
    when t.status = 'open' and t.escalated_at is not null and t.escalation_answered_at is null then 'escalation'
    when t.status = 'open' and p.needs_review then 'review'
    when t.status = 'open' and h.held_count > 0 then 'draft_ready'
    when t.status <> 'open'
      or (t.snoozed_until is not null and t.snoozed_until > now())
      or (t.followup_at is not null
          and t.followup_at >= greatest(coalesce(li.last_inbound_at, '-infinity'), coalesce(lo.last_outbound_at, '-infinity')))
      then null
    when li.last_inbound_at > coalesce(lo.last_outbound_at, '-infinity') then 'replied'
    when t.coming_back_on >= (now() at time zone c.timezone)::date then 'coming_back'
    when lo.last_outbound_at < now() - interval '5 days' then 'at_risk'
    when lo.last_outbound_at < now() - interval '2 days' then 'needs_follow_up'
  end as attention
from public.church_threads t
join public.churches c on c.id = t.church_id
join public.church_people p on p.church_id = t.church_id and p.id = t.person_id
join public.church_visits v on v.church_id = t.church_id and v.id = t.visit_id
left join lateral (
  select max(m.event_at) as last_inbound_at from public.church_messages m
  where m.church_id = t.church_id and m.thread_id = t.id and m.direction = 'inbound' and m.event_type = 'message'
) li on true
left join lateral (
  select max(coalesce(m.sent_at, m.event_at)) as last_outbound_at from public.church_messages m
  where m.church_id = t.church_id and m.thread_id = t.id and m.direction = 'outbound'
    and m.event_type = 'message' and m.status in ('approved', 'sent', 'delivered')
) lo on true
left join lateral (
  select m.id, m.sender, left(m.body, 280) as body, m.event_at, m.channel, m.status from public.church_messages m
  where m.church_id = t.church_id and m.thread_id = t.id and m.event_type = 'message'
    and m.status not in ('draft', 'discarded')
  order by m.event_at desc, m.seq desc
  limit 1
) lm on true
left join lateral (
  select count(*) as held_count, min(m.created_at) as oldest_held_at,
         (array_agg(m.id order by m.created_at))[1] as held_message_id
  from public.church_messages m
  where m.church_id = t.church_id and m.thread_id = t.id and m.direction = 'outbound' and m.status = 'held'
) h on true;

comment on view public.church_inbox is 'One row per thread: latest message and why it needs someone (attention). Read with the caller''s RLS.';

revoke all on public.church_inbox from anon;
grant select on public.church_inbox to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  -- Internal helpers: called from the functions above only.
  foreach f in array array[
    'public.staff_lock_thread(uuid)',
    'public.staff_thread_event(uuid, uuid, text)',
    'public.staff_block_message(text, text)',
    'public.staff_discard_drafts(uuid, uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;

  -- Staff actions: signed-in staff (each checks the church), and the server.
  foreach f in array array[
    'public.staff_send_reply(uuid, text, text, uuid)',
    'public.staff_approve_message(uuid, text)',
    'public.staff_discard_message(uuid)',
    'public.staff_take_over(uuid)',
    'public.staff_release_thread(uuid)',
    'public.staff_escalate(uuid, text)',
    'public.staff_assign_thread(uuid, uuid)',
    'public.staff_followup(uuid, text, text, timestamptz, date)',
    'public.staff_resolve_alert(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
