-- AI-07: three first-contact template families, chosen per guest from what the intake told us.
--
--   welcome    the church's first message (church_first_message + its template), as today.
--              Required: no first contact goes out until it's approved, and Live needs it.
--   family     guests who came with children or asked about kids' programs   (optional)
--   returning  guests who have visited before                                 (optional)
--
-- The two optional families live in church_first_message_families. Each has its own wording and
-- its own pastor approval; until a family is approved (or if the church never sets it up), its
-- guests get the welcome message, exactly as before this migration.
--
-- Before the pastor approves, the app has the wording reviewed by the frontier model (Tier-2,
-- guidelines §5: "every first-contact template family before pastor approval"). The review is
-- advice for the pastor, stored with the wording it reviewed; the pastor decides.
--
-- queue_first_contacts() picks the family (first_contact_family()) and records it in the audit
-- log. No model is involved in sending: the first contact must go out on time, every time.

create table public.church_first_message_families (
  church_id    uuid not null references public.churches (id) on delete cascade,
  family       text not null check (family in ('family', 'returning')),
  body         text not null check (length(btrim(body)) between 1 and 2000),
  status       text not null default 'awaiting' check (status in ('awaiting', 'approved')),
  approved_by  text check (length(approved_by) <= 200),
  approved_at  timestamptz,
  -- Tier-2 review of this exact wording: { verdict, labels, model, reviewed_at, body_md5 }.
  review       jsonb check (review is null or pg_column_size(review) <= 4000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (church_id, family),
  check ((status = 'approved') = (approved_at is not null))
);
comment on table public.church_first_message_families is 'AI-07: optional first-contact families (kids, returning). Owner edits and approves; welcome stays in church_first_message.';

create trigger church_first_message_families_set_updated_at
  before update on public.church_first_message_families
  for each row execute function public.set_updated_at();

alter table public.church_first_message_families enable row level security;
alter table public.church_first_message_families force row level security;
revoke all on public.church_first_message_families from anon, authenticated;
grant select on public.church_first_message_families to authenticated;
create policy "church_first_message_families: members can read" on public.church_first_message_families
  for select to authenticated using (public.is_church_member(church_id));

-- The welcome message's own Tier-2 review.
alter table public.church_first_message
  add column review jsonb check (review is null or pg_column_size(review) <= 4000);

-- ---------------------------------------------------------------------------
-- Owner: save, approve, remove a family (Settings > First Message)
-- ---------------------------------------------------------------------------
create or replace function public.first_message_wording_error(p_body text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when btrim(coalesce(p_body, '')) = '' then 'The message can''t be empty.'
    when length(btrim(p_body)) > 2000 then 'The message must be 2,000 characters or fewer.'
    when position('Reply STOP to opt out' in p_body) = 0 then 'The message must include "Reply STOP to opt out".'
    when position('{first_name}' in p_body) = 0 then 'The message must greet the guest by name: add {first_name}.'
    when exists (select 1 from regexp_matches(p_body, '\{[^}]*\}', 'g') v
                 where v[1] not in ('{first_name}', '{church_name}', '{kids_ministry}')) then 'Use only the variables {first_name}, {church_name} and {kids_ministry}.'
    when length(p_body) - length(replace(p_body, '?', '')) > 1 then 'Ask one question at most.'
  end;
$$;

-- Saves a family's wording. Any change needs the pastor's approval again (and drops the old review).
-- Returns the status: 'approved' if the wording didn't change, else 'awaiting'.
create or replace function public.save_first_message_family(p_family text, p_body text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_church uuid;
  v_body   text := btrim(coalesce(p_body, ''));
  v_old    record;
  v_error  text;
begin
  select o.church_id into v_church from public.settings_owner() o limit 1;
  if v_church is null then
    raise exception 'Only the church owner can change the first messages.' using errcode = '42501';
  end if;
  if p_family not in ('family', 'returning') then
    raise exception 'Unknown message family.' using errcode = '22023';
  end if;
  v_error := public.first_message_wording_error(v_body);
  if v_error is not null then
    raise exception '%', v_error using errcode = '22023';
  end if;

  select body, status into v_old from public.church_first_message_families
  where church_id = v_church and family = p_family for update;
  if found and v_old.body = v_body then
    return v_old.status;
  end if;

  insert into public.church_first_message_families (church_id, family, body)
  values (v_church, p_family, v_body)
  on conflict (church_id, family) do update
    set body = excluded.body, status = 'awaiting', approved_by = null, approved_at = null, review = null;
  insert into public.church_audit_log (church_id, actor_type, actor_user_id, action, details)
  values (v_church, 'staff', auth.uid(), 'first_message.saved', jsonb_build_object('family', p_family));
  return 'awaiting';
end;
$$;

create or replace function public.approve_first_message_family(p_family text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_church uuid;
  v_name   text;
  v_at     timestamptz := now();
  v_body   text;
  v_error  text;
begin
  select o.church_id, o.owner_name into v_church, v_name from public.settings_owner() o limit 1;
  if v_church is null then
    raise exception 'Only the church owner can approve the first messages.' using errcode = '42501';
  end if;
  select body into v_body from public.church_first_message_families where church_id = v_church and family = p_family for update;
  if v_body is null then
    raise exception 'Write this message first.' using errcode = 'P0002';
  end if;
  v_error := public.first_message_wording_error(v_body);
  if v_error is not null then
    raise exception '%', v_error using errcode = '22023';
  end if;
  update public.church_first_message_families set status = 'approved', approved_by = v_name, approved_at = v_at
  where church_id = v_church and family = p_family;
  insert into public.church_audit_log (church_id, actor_type, actor_user_id, action, details)
  values (v_church, 'staff', auth.uid(), 'first_message.approved', jsonb_build_object('family', p_family));
  return v_at;
end;
$$;

-- Turns a family off: its guests get the welcome message again.
create or replace function public.remove_first_message_family(p_family text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_church uuid;
begin
  select o.church_id into v_church from public.settings_owner() o limit 1;
  if v_church is null then
    raise exception 'Only the church owner can change the first messages.' using errcode = '42501';
  end if;
  delete from public.church_first_message_families where church_id = v_church and family = p_family;
  if found then
    insert into public.church_audit_log (church_id, actor_type, actor_user_id, action, details)
    values (v_church, 'staff', auth.uid(), 'first_message.removed', jsonb_build_object('family', p_family));
  end if;
end;
$$;

-- Server only: stores the Tier-2 review of a family's wording, but only if that wording is still
-- the current one (a review of older wording is dropped, never shown against new wording).
create or replace function public.record_first_message_review(p_church uuid, p_family text, p_body text, p_review jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review jsonb := coalesce(p_review, '{}'::jsonb) || jsonb_build_object('body_md5', md5(btrim(coalesce(p_body, ''))));
begin
  if p_family = 'welcome' then
    update public.church_first_message f set review = v_review
    from public.church_message_templates t
    where f.church_id = p_church and t.church_id = f.church_id and t.client_id = f.selected_template
      and btrim(t.body) = btrim(p_body);
  elsif p_family in ('family', 'returning') then
    update public.church_first_message_families set review = v_review
    where church_id = p_church and family = p_family and body = btrim(p_body);
  else
    raise exception 'Unknown message family.' using errcode = '22023';
  end if;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Which family a guest gets
-- ---------------------------------------------------------------------------
-- returning: the guest has an earlier visit than this thread's. family: a child in the household
-- (or an age under 18), or a kids interest on the form. Only approved families count.
create or replace function public.first_contact_family(p_church uuid, p_thread uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select th.church_id, th.person_id, v.visited_at
    from public.church_threads th
    join public.church_visits v on v.church_id = th.church_id and v.id = th.visit_id
    where th.church_id = p_church and th.id = p_thread
  ),
  ok as (
    select f.family from public.church_first_message_families f where f.church_id = p_church and f.status = 'approved'
  )
  select case
    when exists (select 1 from ok where family = 'returning')
         and exists (select 1 from t join public.church_visits v on v.church_id = t.church_id and v.person_id = t.person_id
                     where v.visited_at < t.visited_at)
      then 'returning'
    when exists (select 1 from ok where family = 'family')
         and (exists (select 1 from t join public.church_household_members h on h.church_id = t.church_id and h.person_id = t.person_id
                      where h.relation = 'child' or h.age < 18)
              or exists (select 1 from t join public.church_people p on p.church_id = t.church_id and p.id = t.person_id,
                                unnest(p.interests) i where i ~* '(kid|child|nursery|sunday school)'))
      then 'family'
    else 'welcome'
  end;
$$;

-- ---------------------------------------------------------------------------
-- queue_first_contacts (replaces 20261030100000_email_channel's): now picks the family
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
  v_family   text;
  v_template text;
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
    -- AI-07: the family for this guest; its wording if approved, else the welcome message.
    v_family := public.first_contact_family(r.church_id, r.thread_id);
    v_template := r.template;
    if v_family <> 'welcome' then
      select f.body into v_template from public.church_first_message_families f
      where f.church_id = r.church_id and f.family = v_family and f.status = 'approved';
      if v_template is null then
        v_family := 'welcome';
        v_template := r.template;
      end if;
    end if;
    v_body := replace(replace(replace(v_template,
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
            jsonb_build_object('status', v_status, 'mode', r.mode, 'channel', v_channel, 'family', v_family,
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
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.first_message_wording_error(text) from public, anon;
grant execute on function public.first_message_wording_error(text) to authenticated, service_role;
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.save_first_message_family(text, text)',
    'public.approve_first_message_family(text)',
    'public.remove_first_message_family(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.record_first_message_review(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_first_message_review(uuid, text, text, jsonb) to service_role;
revoke execute on function public.first_contact_family(uuid, uuid) from public, anon, authenticated;
grant execute on function public.first_contact_family(uuid, uuid) to service_role;
revoke execute on function public.queue_first_contacts(timestamptz, int) from public, anon, authenticated;
grant execute on function public.queue_first_contacts(timestamptz, int) to service_role;

-- ---------------------------------------------------------------------------
-- The per-church backup (DB-06) includes the new table
-- ---------------------------------------------------------------------------
create or replace function public.church_backup_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'churches',
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
