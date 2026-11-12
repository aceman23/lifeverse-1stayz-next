-- DB-07: prompt masking, and a separate database role for aggregation.
--
-- 1. church_prompt_log: the rendered prompt of every model call on guest data, with C1 masked
--    ([name], [phone], [email], [address]) and C3 messages replaced by their topic labels, so
--    staff can review what the assistant was shown (guidelines §4.4). Masked in the app before
--    it's written; the database caps the size. Church members can read their own church's rows;
--    written by the server only. Kept 30 days.
--
-- 2. lifeverse_aggregator: the role for the Network Insights / aggregation service (guidelines
--    §7, tracker DB-07 and DB-12). It can read nothing but agg_weekly_engagement(): counts per
--    church and week, only for guests who consented and aren't marked do-not-contact, and every
--    count below 5 suppressed (k = 5). No row of any church table, no text, no names.

create table public.church_prompt_log (
  id                 bigint generated always as identity primary key,
  church_id          uuid not null references public.churches (id) on delete cascade,
  thread_id          uuid,
  message_id         uuid,
  purpose            text not null check (purpose ~ '^[a-z0-9_]{1,40}$'),
  model              text check (length(model) <= 100),
  guardrail_version  int,
  prompt_masked      text not null check (length(prompt_masked) <= 9000),
  created_at         timestamptz not null default now()
);
comment on table public.church_prompt_log is 'Rendered model prompts with C1/C3 masked (guidelines 4.4). Written by the server; members read their own church.';
create index church_prompt_log_thread_idx on public.church_prompt_log (church_id, thread_id, created_at desc);
create index church_prompt_log_age_idx on public.church_prompt_log (created_at);
alter table public.church_prompt_log enable row level security;
alter table public.church_prompt_log force row level security;
revoke all on public.church_prompt_log from anon, authenticated;
grant select on public.church_prompt_log to authenticated;
create policy "church_prompt_log: members can read" on public.church_prompt_log
  for select to authenticated using (public.is_church_member(church_id));

create or replace function public.log_prompt(
  p_church uuid, p_thread uuid, p_message uuid, p_purpose text, p_model text, p_guardrail_version int, p_prompt text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_thread is not null and not exists (select 1 from public.church_threads t where t.id = p_thread and t.church_id = p_church) then
    raise exception 'log_prompt: thread is not in this church' using errcode = '22023';
  end if;
  insert into public.church_prompt_log (church_id, thread_id, message_id, purpose, model, guardrail_version, prompt_masked)
  values (p_church, p_thread, p_message, p_purpose, left(p_model, 100), p_guardrail_version, left(p_prompt, 9000));
  -- Prompt logs follow the assistant's memory: gone after 30 days.
  delete from public.church_prompt_log where created_at < now() - interval '30 days';
end;
$$;
revoke execute on function public.log_prompt(uuid, uuid, uuid, text, text, int, text) from public, anon, authenticated;
grant execute on function public.log_prompt(uuid, uuid, uuid, text, text, int, text) to service_role;

-- ---------------------------------------------------------------------------
-- Aggregation role
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'lifeverse_aggregator') then
    create role lifeverse_aggregator nologin noinherit;
  end if;
end $$;
comment on role lifeverse_aggregator is 'Network Insights / aggregation service: agg_* functions only (DB-07, DB-12).';
grant usage on schema public to lifeverse_aggregator;

create or replace function public.agg_weekly_engagement(p_weeks int default 8)
returns table (
  church_id        uuid,
  week_of          date,
  guests           int,
  first_contacts   int,
  on_time          int,
  replied          int,
  escalations      int,
  suppressed       boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with consented as (
    -- Consent filter: only guests who agreed to be contacted on some channel and aren't
    -- marked do-not-contact count, whatever happened on their thread.
    select p.church_id, p.id
    from public.church_people p
    where not p.do_not_contact
      and exists (
        -- The latest consent event on some channel is a grant (an opt-out after it cancels it).
        select 1 from (
          select distinct on (c.channel) c.status
          from public.church_consents c
          where c.church_id = p.church_id and c.person_id = p.id
          order by c.channel, c.event_at desc
        ) latest
        where latest.status = 'granted')
  ),
  t as (
    select th.church_id,
           (date_trunc('week', (th.created_at at time zone ch.timezone) + interval '1 day') - interval '1 day')::date as week_of,
           th.first_contact_sent_at is not null as contacted,
           coalesce(s.on_time, false) as on_time,
           exists (select 1 from public.church_messages m
                   where m.church_id = th.church_id and m.thread_id = th.id and m.direction = 'inbound' and m.event_type = 'message') as replied,
           th.escalated_at is not null as escalated
    from public.church_threads th
    join public.churches ch on ch.id = th.church_id
    join consented cp on cp.church_id = th.church_id and cp.id = th.person_id
    left join public.church_first_contact_stats s on s.thread_id = th.id
    where th.created_at >= now() - make_interval(weeks => least(greatest(p_weeks, 1), 52))
  ),
  g as (
    select church_id, week_of,
           count(*)::int as guests,
           count(*) filter (where contacted)::int as first_contacts,
           count(*) filter (where on_time)::int as on_time,
           count(*) filter (where replied)::int as replied,
           count(*) filter (where escalated)::int as escalations
    from t group by church_id, week_of
  )
  -- k-suppression (k = 5): a week with fewer than 5 guests shows no counts at all, and any
  -- smaller count is hidden, so no single guest can be picked out.
  select church_id, week_of,
         case when guests < 5 then null else guests end,
         case when guests < 5 or first_contacts < 5 then null else first_contacts end,
         case when guests < 5 or on_time < 5 then null else on_time end,
         case when guests < 5 or replied < 5 then null else replied end,
         case when guests < 5 or escalations < 5 then null else escalations end,
         guests < 5 or first_contacts < 5 or on_time < 5 or replied < 5 or escalations < 5
  from g
  order by week_of desc, church_id;
$$;

revoke execute on function public.agg_weekly_engagement(int) from public, anon, authenticated;
grant execute on function public.agg_weekly_engagement(int) to lifeverse_aggregator, service_role;
