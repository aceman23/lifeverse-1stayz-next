-- DB-05 / guidelines 4.3: the agent's memory of a visit thread expires 30 days after the visit
-- window (the thread's last activity), then is compacted to a state summary.
--
--   church_threads.compacted_at / state_summary   when it was compacted, and the summary: counts,
--                                                   dates and labels only (never message text)
--   compact_stale_threads()                         run by the message cron; compacts threads with no
--                                                   activity for 30 days (again if they woke up and
--                                                   went quiet again)
--   agent_context()                                 now skips turns from before the compaction and
--                                                   passes the summary instead
--
-- Messages themselves are kept: staff still see the whole conversation, and the church's export
-- and the audit trail are unchanged (pilot plan 1.4: raw messages are the audit log). An open,
-- unanswered escalation is never compacted.

alter table public.church_threads
  add column compacted_at   timestamptz,
  add column state_summary  jsonb;

create index church_threads_compact_idx on public.church_threads ((coalesce(last_event_at, created_at)))
  where compacted_at is null or compacted_at < last_event_at;

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
      'first_contact_sent', t.first_contact_sent_at is not null,
      -- After 30 days without activity the turns are compacted (guidelines 4.3): the assistant
      -- gets this summary (counts and labels only) instead of the old turns.
      'earlier', case when t.compacted_at is not null then t.state_summary end),
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
          and (t.compacted_at is null or m.event_at > t.compacted_at)
        order by m.seq desc
        limit 8) x), '[]'::jsonb),
    'assistant_replies_24h', (
      select count(*) from public.church_messages m
      where m.church_id = t.church_id and m.thread_id = t.id and m.sender = 'assistant' and m.purpose = 'reply'
        and m.created_at > now() - interval '24 hours' and m.status <> 'discarded'));
end;
$$;

-- Threads quiet for p_after (default 30 days): store the summary, mark compacted, audit it.
-- Returns how many were compacted. Bounded per call; the cron calls it every run.
create or replace function public.compact_stale_threads(p_now timestamptz default now(), p_after interval default interval '30 days', p_limit int default 200)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r    record;
  v_n  int := 0;
begin
  for r in
    select t.* from public.church_threads t
    where (t.compacted_at is null or t.compacted_at < t.last_event_at)
      and coalesce(t.last_event_at, t.created_at) < p_now - p_after
      and not (t.escalated_at is not null and t.escalation_answered_at is null and t.status = 'open')
    order by coalesce(t.last_event_at, t.created_at)
    limit least(greatest(p_limit, 1), 1000)
    for update of t skip locked
  loop
    update public.church_threads t
    set compacted_at = p_now,
        state_summary = (
          select jsonb_build_object(
            'messages', count(*) filter (where m.event_type = 'message'),
            'guest_messages', count(*) filter (where m.event_type = 'message' and m.direction = 'inbound'),
            'first_at', min(m.event_at),
            'last_at', max(m.event_at),
            'last_guest_at', max(m.event_at) filter (where m.direction = 'inbound' and m.event_type = 'message'),
            'data_classes', coalesce(jsonb_agg(distinct m.data_class) filter (where m.direction = 'inbound' and m.data_class is not null), '[]'::jsonb),
            'escalation_reason', r.escalation_reason,
            'escalation_answered', r.escalation_answered_at is not null,
            'followup_state', r.followup_state,
            'coming_back_on', r.coming_back_on,
            'status', r.status)
          from public.church_messages m
          where m.church_id = r.church_id and m.thread_id = r.id)
    where t.id = r.id;

    insert into public.church_audit_log (church_id, thread_id, actor_type, action, reason)
    values (r.church_id, r.id, 'system', 'thread.compacted', 'ttl_30d');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.compact_stale_threads(timestamptz, interval, int) from public, anon, authenticated;
grant execute on function public.compact_stale_threads(timestamptz, interval, int) to service_role;
