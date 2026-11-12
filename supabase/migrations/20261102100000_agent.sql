-- WP-7b: the reply agent and escalation classifier (AI-04, AI-05, AI-07, AI-08).
--
-- The loop (src/lib/messaging/agent.ts, run by the cron and right after a guest message):
--   agent_claim_threads()  open threads the assistant handles, with a guest message it hasn't
--                          looked at yet, at churches in Shadow or Live with approved guardrails.
--                          Leased, so two runs never work on the same thread.
--   agent_context()        the working context (guidelines §4.3): last 8 turns, the fact card,
--                          the church's details and its approved guardrails (with version).
--                          Every item carries church_id; the app checks them all (ISO-2).
--   then exactly one of:
--   agent_escalate()       hand the thread to staff (it shows on Today with the 15-minute timer)
--   agent_record_reply()   a reply draft: held for staff in Shadow mode (or when a check failed),
--                          approved to send in Live mode
--   agent_skip()           nothing to do (no model allowed yet, daily cap, the gate blocked it)
--
-- Send time: an assistant reply is discarded as stale if the guest or staff wrote after it was
-- drafted and no staff member approved it (claim_outbound, replaced below).
--
-- All functions here are for the server (service role) only.

alter table public.church_threads
  -- seq of the latest guest message the agent has handled.
  add column agent_seen_seq     bigint not null default 0,
  add column agent_lease_until  timestamptz;

-- ---------------------------------------------------------------------------
-- Claim
-- ---------------------------------------------------------------------------
create or replace function public.agent_claim_threads(
  p_now timestamptz default now(), p_limit int default 10, p_lease_seconds int default 120)
returns table (thread_id uuid, church_id uuid, mode text, guest_seq bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select t.id, t.church_id, op.mode, g.seq as guest_seq
    from public.church_threads t
    join public.onboarding_progress op on op.church_id = t.church_id and op.completed and op.mode in ('shadow', 'live')
    join public.church_guardrails gr on gr.church_id = t.church_id and gr.approved_at is not null
    join lateral (
      select max(m.seq) as seq from public.church_messages m
      where m.church_id = t.church_id and m.thread_id = t.id and m.direction = 'inbound' and m.event_type = 'message'
    ) g on true
    where t.status = 'open' and t.handled_by = 'assistant'
      and not (t.escalated_at is not null and t.escalation_answered_at is null)
      and g.seq > t.agent_seen_seq
      and (t.agent_lease_until is null or t.agent_lease_until < p_now)
    order by t.last_event_at nulls last
    limit least(greatest(p_limit, 1), 50)
    for update of t skip locked
  loop
    update public.church_threads set agent_lease_until = p_now + make_interval(secs => p_lease_seconds)
    where id = r.id;
    thread_id := r.id;
    church_id := r.church_id;
    mode := r.mode;
    guest_seq := r.guest_seq;
    return next;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Working context
-- ---------------------------------------------------------------------------
create or replace function public.agent_context(p_thread uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t   public.church_threads%rowtype;
  gv  record;
begin
  select * into t from public.church_threads where id = p_thread;
  if not found then
    return null;
  end if;
  select * into gv from public.current_guardrail_version(t.church_id);

  return jsonb_build_object(
    'church_id', t.church_id,
    'thread', jsonb_build_object(
      'church_id', t.church_id, 'id', t.id, 'channel', t.channel, 'version', t.version,
      'first_contact_sent', t.first_contact_sent_at is not null),
    'church', (
      select jsonb_build_object(
        'church_id', c.id, 'name', c.name, 'timezone', c.timezone, 'website', c.website, 'address', c.address,
        'services', coalesce((
          select jsonb_agg(jsonb_build_object('name', s.name, 'day', s.day, 'start', s.start_time, 'end', s.end_time) order by s.position)
          from public.church_services s where s.church_id = c.id and s.start_time is not null), '[]'::jsonb),
        'ministries', coalesce((select to_jsonb(sp.ministries) from public.church_site_profile sp where sp.church_id = c.id), '[]'::jsonb))
      from public.churches c where c.id = t.church_id),
    'guardrails', jsonb_build_object('church_id', t.church_id, 'version', gv.version, 'config', gv.config),
    'person', (
      select jsonb_build_object(
        'church_id', p.church_id, 'id', p.id, 'first_name', p.first_name, 'interests', to_jsonb(p.interests),
        'visit_count', p.visit_count,
        'household', coalesce((
          select jsonb_agg(jsonb_build_object('church_id', h.church_id, 'name', h.name, 'relation', h.relation, 'age', h.age) order by h.position)
          from public.church_household_members h where h.church_id = p.church_id and h.person_id = p.id), '[]'::jsonb),
        'facts', coalesce((
          select jsonb_agg(jsonb_build_object('church_id', f.church_id, 'value', f.value, 'data_class', f.data_class) order by f.event_at desc)
          from (select * from public.church_person_facts f2
                where f2.church_id = p.church_id and f2.person_id = p.id order by f2.event_at desc limit 12) f), '[]'::jsonb))
      from public.church_people p where p.church_id = t.church_id and p.id = t.person_id),
    'visit', (
      select jsonb_build_object('church_id', v.church_id, 'visited_at', v.visited_at, 'service_name', v.service_name)
      from public.church_visits v where v.church_id = t.church_id and v.id = t.visit_id),
    -- The last 8 turns, oldest first. Only what the guest saw or wrote.
    'turns', coalesce((
      select jsonb_agg(x.turn order by x.seq)
      from (
        select m.seq, jsonb_build_object('church_id', m.church_id, 'id', m.id, 'seq', m.seq, 'from', m.sender,
                                         'channel', m.channel, 'body', m.body, 'at', m.event_at) as turn
        from public.church_messages m
        where m.church_id = t.church_id and m.thread_id = t.id and m.event_type = 'message'
          and (m.direction = 'inbound' or m.status in ('approved', 'sent', 'delivered'))
        order by m.seq desc
        limit 8) x), '[]'::jsonb),
    'assistant_replies_24h', (
      select count(*) from public.church_messages m
      where m.church_id = t.church_id and m.thread_id = t.id and m.sender = 'assistant' and m.purpose = 'reply'
        and m.created_at > now() - interval '24 hours' and m.status <> 'discarded'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Outcomes
-- ---------------------------------------------------------------------------
-- Hand the thread to staff. p_source: 'rules', 'model' (Tier-1) or 'tier2'. p_detail: labels only.
create or replace function public.agent_escalate(p_thread uuid, p_seen_seq bigint, p_reason text, p_source text, p_detail jsonb default '{}')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.church_threads%rowtype;
begin
  if p_reason not in ('care', 'crisis', 'theology', 'meet_pastor', 'other') or p_source not in ('rules', 'model', 'tier2') then
    raise exception 'agent_escalate: invalid reason or source' using errcode = '22023';
  end if;
  select * into t from public.church_threads where id = p_thread for update;
  if not found then
    return false;
  end if;

  update public.church_threads
  set agent_seen_seq = greatest(agent_seen_seq, p_seen_seq), agent_lease_until = null
  where id = t.id;
  -- Staff already have it, or it's closed: nothing to escalate.
  if t.status <> 'open' or (t.escalated_at is not null and t.escalation_answered_at is null) then
    return false;
  end if;

  update public.church_threads
  set escalated_at = now(), escalation_reason = p_reason, escalated_by = null,
      escalation_answered_at = null, escalation_answered_by = null, handled_by = 'staff',
      followup_state = null, followup_reason = null, followup_at = null, followup_by = null, snoozed_until = null
  where id = t.id;
  insert into public.church_messages
    (church_id, thread_id, event_type, direction, sender, channel, status, event_at, source, data_class)
  values (t.church_id, t.id, 'escalation', 'internal', 'system', 'app', 'logged', now(), 'model', 'C5');
  perform public.staff_discard_drafts(t.church_id, t.id, 'escalated');
  insert into public.church_audit_log (church_id, thread_id, actor_type, action, reason, details)
  values (t.church_id, t.id, case when p_source = 'rules' then 'system' else 'model' end, 'thread.escalated', p_reason,
          jsonb_build_object('source', p_source) || coalesce(p_detail, '{}'::jsonb));
  return true;
end;
$$;

-- A reply draft. Returns the message id, or null when nothing was saved (the guest wrote again
-- meanwhile, staff took over, or the guest can't be contacted).
create or replace function public.agent_record_reply(
  p_thread uuid, p_seen_seq bigint, p_body text, p_channel text, p_hold boolean, p_guardrail_version int, p_detail jsonb default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t         public.church_threads%rowtype;
  v_mode    text;
  v_reason  text;
  v_status  text;
  v_id      uuid;
  v_body    text := btrim(p_body);
begin
  if v_body is null or v_body = '' or p_channel not in ('sms', 'email') then
    raise exception 'agent_record_reply: empty body or bad channel' using errcode = '22023';
  end if;
  if (p_channel = 'sms' and length(v_body) > 1600) or length(v_body) > 10000 then
    raise exception 'agent_record_reply: body too long' using errcode = '22023';
  end if;
  select * into t from public.church_threads where id = p_thread for update;
  if not found then
    return null;
  end if;

  -- Another run already answered this guest message.
  if p_seen_seq <= t.agent_seen_seq then
    return null;
  end if;

  -- A newer guest message arrived while drafting: leave it for the next run.
  if exists (select 1 from public.church_messages m where m.church_id = t.church_id and m.thread_id = t.id
             and m.direction = 'inbound' and m.event_type = 'message' and m.seq > p_seen_seq) then
    update public.church_threads set agent_lease_until = null where id = t.id;
    return null;
  end if;

  update public.church_threads
  set agent_seen_seq = greatest(agent_seen_seq, p_seen_seq), agent_lease_until = null
  where id = t.id;

  if t.status <> 'open' or t.handled_by <> 'assistant'
     or (t.escalated_at is not null and t.escalation_answered_at is null) then
    return null;
  end if;

  v_reason := public.outbound_block_reason(t.church_id, t.id, p_channel, 'assistant');
  if v_reason in ('do_not_contact', 'no_consent') or v_reason like 'thread_%' then
    insert into public.church_audit_log (church_id, thread_id, actor_type, action, reason, guardrail_version)
    values (t.church_id, t.id, 'model', 'agent.skipped', v_reason, p_guardrail_version);
    return null;
  end if;

  select op.mode into v_mode from public.onboarding_progress op where op.church_id = t.church_id;
  v_status := case when v_mode = 'live' and not p_hold and v_reason is null then 'approved' else 'held' end;

  insert into public.church_messages
    (church_id, thread_id, event_type, direction, sender, channel, body, status, purpose,
     built_from_version, send_after, event_at, source)
  values
    (t.church_id, t.id, 'message', 'outbound', 'assistant', p_channel, v_body, v_status, 'reply',
     t.version, now(), now(), 'model')
  returning id into v_id;

  insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, action, reason, guardrail_version, details)
  values (t.church_id, t.id, v_id, 'model', 'agent.reply_drafted', v_status, p_guardrail_version,
          jsonb_build_object('mode', v_mode, 'held_for_check', p_hold, 'blocked', v_reason) || coalesce(p_detail, '{}'::jsonb));
  return v_id;
end;
$$;

-- Nothing to send for this guest message. p_reason: a code ('no_model', 'daily_cap', 'tier2_block', ...).
create or replace function public.agent_skip(p_thread uuid, p_seen_seq bigint, p_reason text, p_guardrail_version int default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.church_threads%rowtype;
begin
  update public.church_threads
  set agent_seen_seq = greatest(agent_seen_seq, p_seen_seq), agent_lease_until = null
  where id = p_thread
  returning * into t;
  if t.id is not null then
    insert into public.church_audit_log (church_id, thread_id, actor_type, action, reason, guardrail_version)
    values (t.church_id, t.id, 'model', 'agent.skipped', left(p_reason, 60), p_guardrail_version);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stale drafts never go out (WP-6's claim_outbound plus one check)
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
    select m.id, m.church_id, m.thread_id, m.body, m.sender, m.purpose, m.send_attempts, m.seq, m.approved_by,
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
    -- An assistant reply no person approved is stale once the guest or staff wrote after it
    -- (guidelines 4.8.2).
    if v_reason is null and r.sender = 'assistant' and r.purpose = 'reply' and r.approved_by is null
       and exists (select 1 from public.church_messages n
                   where n.church_id = r.church_id and n.thread_id = r.thread_id and n.seq > r.seq and n.event_type = 'message'
                     and (n.direction = 'inbound' or n.sender = 'staff')) then
      v_reason := 'stale_draft';
    end if;
    if v_reason is not null then
      update public.church_messages
      set status = 'discarded', failure_reason = 'blocked_' || v_reason, lease_until = null
      where church_messages.church_id = r.church_id and id = r.id;
      insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, action, reason, details)
      values (r.church_id, r.thread_id, r.id, 'scheduler', 'message.blocked', v_reason, jsonb_build_object('channel', p_channel));
      continue;
    end if;

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
-- Privileges: the server only
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.agent_claim_threads(timestamptz, int, int)',
    'public.agent_context(uuid)',
    'public.agent_escalate(uuid, bigint, text, text, jsonb)',
    'public.agent_record_reply(uuid, bigint, text, text, boolean, int, jsonb)',
    'public.agent_skip(uuid, bigint, text, int)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
