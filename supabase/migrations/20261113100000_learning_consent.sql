-- AI-06: the church's learning consent, with the restrictive defaults the guidelines require
-- (AI Architecture & Data Isolation Guidelines §5 `learning_consent`, §6.3, §7 AGG-3).
--
--   in_tenant_only            true   the church's data is used for that church only
--   contribute_patterns       false  no de-identified pattern records (true only after the church
--                                    signs the Learning Consent Addendum)
--   contribute_aggregates     false  absent from every cross-church aggregate (same addendum)
--   share_denomination_family false
--   training_authorized       false  never during the pilot: the column can't be set to true here
--   k_minimum                 5      smallest count any aggregate may show (never below 5)
--
-- Every church gets a row (existing ones now, new ones when created). Church members can read it
-- (Settings > Your Data shows it); nobody can change it from the app: a signed addendum is
-- recorded by Lifeverse with the service role (set_learning_consent), and training can't be
-- switched on at all until a later migration adds the §6.5 authorization gate.
--
-- agg_weekly_engagement() now leaves out every church whose contribute_aggregates is false
-- (AGG-3) and uses the church's k_minimum (at least 5).

create table public.church_learning_consent (
  church_id                  uuid primary key references public.churches (id) on delete cascade,
  in_tenant_only             boolean not null default true,
  contribute_patterns        boolean not null default false,
  contribute_aggregates      boolean not null default false,
  share_denomination_family  boolean not null default false,
  training_authorized        boolean not null default false check (training_authorized = false),
  k_minimum                  int not null default 5 check (k_minimum between 5 and 100),
  addendum_signed_at         timestamptz,
  addendum_signed_by         text check (length(addendum_signed_by) <= 200),
  updated_at                 timestamptz not null default now(),
  -- Sharing anything beyond the church needs the signed addendum.
  check ((contribute_patterns or contribute_aggregates or share_denomination_family) = false or addendum_signed_at is not null),
  check (in_tenant_only = not (contribute_patterns or contribute_aggregates or share_denomination_family))
);
comment on table public.church_learning_consent is 'Learning consent (guidelines 5, 6.3): restrictive by default; training_authorized is always false during the pilot.';

create trigger church_learning_consent_set_updated_at
  before update on public.church_learning_consent
  for each row execute function public.set_updated_at();

alter table public.church_learning_consent enable row level security;
alter table public.church_learning_consent force row level security;
revoke all on public.church_learning_consent from anon, authenticated;
grant select on public.church_learning_consent to authenticated;
create policy "church_learning_consent: members can read" on public.church_learning_consent
  for select to authenticated using (public.is_church_member(church_id));

insert into public.church_learning_consent (church_id) select id from public.churches on conflict do nothing;

create or replace function public.churches_create_learning_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.church_learning_consent (church_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
revoke execute on function public.churches_create_learning_consent() from public, anon, authenticated;
create trigger churches_create_learning_consent
  after insert on public.churches
  for each row execute function public.churches_create_learning_consent();

-- Lifeverse records a signed Learning Consent Addendum (service role only). Audited.
create or replace function public.set_learning_consent(
  p_church uuid, p_contribute_patterns boolean, p_contribute_aggregates boolean, p_share_denomination_family boolean,
  p_signed_by text, p_signed_at timestamptz, p_k_minimum int default 5
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_any boolean := coalesce(p_contribute_patterns, false) or coalesce(p_contribute_aggregates, false) or coalesce(p_share_denomination_family, false);
begin
  if v_any and (nullif(btrim(coalesce(p_signed_by, '')), '') is null or p_signed_at is null) then
    raise exception 'Sharing needs the signed Learning Consent Addendum: who signed it and when.' using errcode = '22023';
  end if;
  update public.church_learning_consent set
    contribute_patterns = coalesce(p_contribute_patterns, false),
    contribute_aggregates = coalesce(p_contribute_aggregates, false),
    share_denomination_family = coalesce(p_share_denomination_family, false),
    in_tenant_only = not v_any,
    k_minimum = greatest(coalesce(p_k_minimum, 5), 5),
    addendum_signed_by = case when v_any then btrim(p_signed_by) end,
    addendum_signed_at = case when v_any then p_signed_at end
  where church_id = p_church;
  if not found then
    raise exception 'No such church.' using errcode = 'P0002';
  end if;
  insert into public.church_audit_log (church_id, actor_type, action, details)
  values (p_church, 'system', 'learning_consent.changed',
          jsonb_build_object('contribute_patterns', coalesce(p_contribute_patterns, false),
                             'contribute_aggregates', coalesce(p_contribute_aggregates, false),
                             'share_denomination_family', coalesce(p_share_denomination_family, false),
                             'k_minimum', greatest(coalesce(p_k_minimum, 5), 5)));
end;
$$;
revoke execute on function public.set_learning_consent(uuid, boolean, boolean, boolean, text, timestamptz, int) from public, anon, authenticated;
grant execute on function public.set_learning_consent(uuid, boolean, boolean, boolean, text, timestamptz, int) to service_role;

-- ---------------------------------------------------------------------------
-- Aggregation: only churches that agreed to contribute (AGG-3), their own k (at least 5)
-- ---------------------------------------------------------------------------
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
  with contributing as (
    select lc.church_id, greatest(lc.k_minimum, 5) as k
    from public.church_learning_consent lc
    where lc.contribute_aggregates
  ),
  consented as (
    select p.church_id, p.id
    from public.church_people p
    join contributing cc on cc.church_id = p.church_id
    where not p.do_not_contact
      and exists (
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
    select t.church_id, t.week_of, cc.k,
           count(*)::int as guests,
           count(*) filter (where contacted)::int as first_contacts,
           count(*) filter (where t.on_time)::int as on_time,
           count(*) filter (where replied)::int as replied,
           count(*) filter (where escalated)::int as escalations
    from t join contributing cc on cc.church_id = t.church_id
    group by t.church_id, t.week_of, cc.k
  )
  select church_id, week_of,
         case when guests < k then null else guests end,
         case when guests < k or first_contacts < k then null else first_contacts end,
         case when guests < k or on_time < k then null else on_time end,
         case when guests < k or replied < k then null else replied end,
         case when guests < k or escalations < k then null else escalations end,
         guests < k or first_contacts < k or on_time < k or replied < k or escalations < k
  from g
  order by week_of desc, church_id;
$$;
revoke execute on function public.agg_weekly_engagement(int) from public, anon, authenticated;
grant execute on function public.agg_weekly_engagement(int) to lifeverse_aggregator, service_role;

-- ---------------------------------------------------------------------------
-- The per-church backup (DB-06) includes the consent
-- ---------------------------------------------------------------------------
create or replace function public.church_backup_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'churches',
    'church_learning_consent',
    'church_members',
    'church_site_profile',
    'church_services',
    'church_needs',
    'church_integrations',
    'church_guardrails',
    'church_documents',
    'church_doctrinal_positions',
    'church_escalation_topics',
    'church_staff',
    'church_team_settings',
    'church_message_templates',
    'church_first_message',
    'church_first_message_families',
    'church_guardrail_versions',
    'onboarding_progress',
    'church_sms_numbers',
    'church_sms_policies',
    'church_intake_keys',
    'church_people',
    'church_household_members',
    'church_visits',
    'church_person_facts',
    'church_consents',
    'church_threads',
    'church_thread_participants',
    'church_messages',
    'church_alerts',
    'church_notifications',
    'church_audit_log',
    'church_prompt_log'
  ]::text[];
$$;
