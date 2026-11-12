-- WP-2: guest intake (UI-02; feeds SS-03). A connection card or Subsplash form becomes a
-- guest (church_people), a visit (church_visits) and a conversation thread (church_threads)
-- with its first-contact deadline, in one transaction.
--
-- Run after 20261027100000_church_threads.sql.
--
-- Flow: POST /api/intake (src/app/api/intake/route.ts) with a church's intake key
--   -> the route hashes the key and calls intake_guest() as the server (service role)
--   -> intake_guest() resolves the church from the key and does everything below.

-- ---------------------------------------------------------------------------
-- Possible-duplicate link for identity review (guidelines 4.8.3)
-- ---------------------------------------------------------------------------
-- When intake isn't sure a guest is someone already on file, it creates a new person with
-- needs_review = true and points here at the possible match. Nothing is merged automatically.
alter table public.church_people
  add column review_candidate_id uuid,
  add constraint church_people_review_candidate_fkey
    foreign key (church_id, review_candidate_id) references public.church_people (church_id, id)
    on delete set null (review_candidate_id);

-- ---------------------------------------------------------------------------
-- church_intake_keys: one shared secret per integration (Subsplash, Zapier, a kiosk, ...)
-- ---------------------------------------------------------------------------
-- Only a SHA-256 hash is stored. The key itself is shown once, when it's created.
create table public.church_intake_keys (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null references public.churches (id) on delete cascade,
  label         text not null default 'Subsplash' check (length(btrim(label)) between 1 and 60),
  -- First 12 characters ("isk_1a2b3c4d"), so staff can tell keys apart.
  key_prefix    text not null check (key_prefix ~ '^isk_[0-9a-f]{8}$'),
  key_hash      text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

create index church_intake_keys_church_idx on public.church_intake_keys (church_id);

revoke all on public.church_intake_keys from anon, authenticated;
-- Staff see their church's keys, never the hashes.
grant select (id, church_id, label, key_prefix, created_by, created_at, last_used_at, revoked_at)
  on public.church_intake_keys to authenticated;

create policy "church_intake_keys: members can read" on public.church_intake_keys
  for select to authenticated using (public.is_church_member(church_id));

-- Creates a key for the caller's church (owner only) and returns it. This is the only time
-- the key is visible; afterwards only its hash exists. At most 5 active keys per church.
create or replace function public.create_intake_key(p_label text default 'Subsplash')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_church  uuid;
  v_key     text;
  v_label   text := coalesce(nullif(btrim(p_label), ''), 'Subsplash');
begin
  if auth.uid() is null then
    raise exception 'Sign in to create an intake key.' using errcode = '28000';
  end if;

  select m.church_id into v_church
  from public.church_members m
  where m.user_id = auth.uid() and m.is_owner
  order by m.created_at
  limit 1;

  if v_church is null then
    raise exception 'Only the church owner can create intake keys.' using errcode = '42501';
  end if;
  if length(v_label) > 60 then
    raise exception 'Keep the label to 60 characters or fewer.' using errcode = '22023';
  end if;
  if (select count(*) from public.church_intake_keys k where k.church_id = v_church and k.revoked_at is null) >= 5 then
    raise exception 'Revoke an old key first: a church can have 5 active keys.' using errcode = '22023';
  end if;

  -- 2 x 122 random bits from gen_random_uuid (a cryptographically strong source).
  v_key := 'isk_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.church_intake_keys (church_id, label, key_prefix, key_hash, created_by)
  values (v_church, v_label, left(v_key, 12), encode(sha256(convert_to(v_key, 'UTF8')), 'hex'), auth.uid());

  return v_key;
end;
$$;

-- Revokes one of the caller's church's keys (owner only). Takes effect immediately.
create or replace function public.revoke_intake_key(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to revoke an intake key.' using errcode = '28000';
  end if;

  update public.church_intake_keys k
  set revoked_at = coalesce(k.revoked_at, now())
  where k.id = p_id
    and exists (
      select 1 from public.church_members m
      where m.church_id = k.church_id and m.user_id = auth.uid() and m.is_owner
    );

  if not found then
    raise exception 'Intake key not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.create_intake_key(text) from public, anon;
revoke execute on function public.revoke_intake_key(uuid) from public, anon;
grant execute on function public.create_intake_key(text) to authenticated;
grant execute on function public.revoke_intake_key(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- "  mary   jane " -> "Mary Jane"; "JOHN" -> "John"; mixed case ("McDonald") is kept.
create or replace function public.intake_normalize_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if v = lower(v) or v = upper(v) then
    v := initcap(v);
  end if;
  return nullif(v, '');
end;
$$;

-- The service a guest attended, in the church's timezone. In order of preference:
--   1. a service in progress, or one that ended at most 30 minutes ago (cards filled in during
--      or right after the service), the latest such;
--   2. otherwise the next service starting within 2 hours (people who arrive early);
--   3. otherwise the most recent service before p_at (forms sent later in the week).
-- p_service narrows it to one service (client_id or name). Returns UTC start and end of that
-- occurrence; no usable schedule -> no rows.
create or replace function public.intake_resolve_service(p_church uuid, p_tz text, p_at timestamptz, p_service text)
returns table (service_name text, starts_at timestamptz, ends_at timestamptz)
language sql
stable
set search_path = ''
as $$
  with params as (
    select p_at at time zone p_tz as v_local
  ),
  occurrences as (
    -- For each service: its most recent start at or before p_at, and the one after that.
    select cs.name,
           cs.start_time, cs.end_time,
           (p.v_local::date
              - ((extract(dow from p.v_local)::int
                  - (array_position(array['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], cs.day) - 1)
                  + 7) % 7)) + cs.start_time as this_week_start,
           p.v_local
    from public.church_services cs, params p
    where cs.church_id = p_church
      and cs.day is not null and cs.start_time is not null and cs.end_time is not null
      and (p_service is null or cs.client_id = p_service or lower(btrim(cs.name)) = lower(btrim(p_service)))
  ),
  starts as (
    select name, start_time, end_time, v_local,
           case when this_week_start <= v_local then this_week_start else this_week_start - interval '7 days' end as prev_start
    from occurrences
  ),
  candidates as (
    select name, v_local, prev_start as start_local,
           prev_start::date + end_time + case when end_time <= start_time then interval '1 day' else interval '0' end as end_local
    from starts
    union all
    select name, v_local, prev_start + interval '7 days',
           (prev_start + interval '7 days')::date + end_time + case when end_time <= start_time then interval '1 day' else interval '0' end
    from starts
  ),
  ranked as (
    select name, start_local, end_local,
           case
             when start_local <= v_local and v_local <= end_local + interval '30 minutes' then 1
             when start_local > v_local and start_local <= v_local + interval '2 hours' then 2
             when start_local <= v_local then 3
           end as tier
    from candidates
  )
  select name, start_local at time zone p_tz, end_local at time zone p_tz
  from ranked
  where tier is not null
  order by tier,
           case when tier = 2 then start_local end asc,
           start_local desc
  limit 1;
$$;

revoke execute on function public.intake_normalize_name(text) from public, anon, authenticated;
revoke execute on function public.intake_resolve_service(uuid, text, timestamptz, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- intake_guest: the whole intake, in one transaction
-- ---------------------------------------------------------------------------
-- p_key_hash: SHA-256 (hex) of the intake key from the request.
-- p_payload (validated for shape by the route):
--   source          'subsplash' | 'connect_card' | 'website' | 'text_in'       (required)
--   submission_id   the source's own id for this submission                      (required)
--   submitted_at    ISO time the form was submitted (default: now)
--   attended_at     ISO time of the visit, if the source knows it
--   service         a church_services client_id or name, if the source knows it
--   first_name (required), last_name, email, phone, city
--   sms_consent, email_consent (booleans, default false), consent_wording
--   interests       text[]
--   household       [{ name, relation: spouse|child|parent|other, age }]
--   prayer_request  free text; stored as a C3 fact (never leaves the church)
-- Returns { status: created|duplicate, person_id, visit_id, thread_id, match,
--           service_end_at, first_contact_due_at, warnings }. Never returns guest details.
create or replace function public.intake_guest(p_key_hash text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key         public.church_intake_keys%rowtype;
  v_church      public.churches%rowtype;
  v_source      text := p_payload->>'source';
  v_sub_id      text := nullif(btrim(p_payload->>'submission_id'), '');
  v_at          timestamptz;
  v_first       text;
  v_last        text;
  v_email       text;
  v_phone       text;
  v_digits      text;
  v_city        text := nullif(btrim(p_payload->>'city'), '');
  v_sms_ok      boolean;
  v_email_ok    boolean;
  v_wording     text := nullif(btrim(p_payload->>'consent_wording'), '');
  v_interests   text[];
  v_warnings    text[] := '{}';
  v_dup         public.church_visits%rowtype;
  v_svc         record;
  v_person      public.church_people%rowtype;
  v_candidate   uuid;
  v_match       text;
  v_person_id   uuid;
  v_visit_id    uuid;
  v_thread_id   uuid;
  v_channel     text;
  v_due         timestamptz;
  v_consent_src text;
begin
  -- Which church: from the key, never from the payload.
  select * into v_key from public.church_intake_keys k
  where k.key_hash = p_key_hash and k.revoked_at is null;
  if not found then
    raise exception 'invalid_intake_key' using errcode = '28000';
  end if;
  select * into v_church from public.churches c where c.id = v_key.church_id;
  update public.church_intake_keys set last_used_at = now() where id = v_key.id;

  -- Required fields.
  if v_source is null or v_source not in ('subsplash', 'connect_card', 'website', 'text_in') then
    raise exception 'source must be subsplash, connect_card, website or text_in' using errcode = '22023';
  end if;
  if v_sub_id is null or length(v_sub_id) > 200 then
    raise exception 'submission_id is required (200 characters at most)' using errcode = '22023';
  end if;

  -- Retries of the same submission (Zapier/Make re-deliveries, double posts) wait here for
  -- the first one, then find its visit and return it (ORD-3).
  perform pg_advisory_xact_lock(hashtextextended(v_church.id::text || '|' || v_source || '|' || v_sub_id, 0));

  select * into v_dup from public.church_visits v
  where v.church_id = v_church.id and v.source = v_source and v.source_event_id = v_sub_id;
  if found then
    insert into public.church_audit_log (church_id, actor_type, action, details)
    values (v_church.id, 'webhook', 'intake.duplicate', jsonb_build_object('visit_id', v_dup.id, 'source', v_source));
    return jsonb_build_object(
      'status', 'duplicate',
      'person_id', v_dup.person_id,
      'visit_id', v_dup.id,
      'thread_id', (select t.id from public.church_threads t where t.church_id = v_church.id and t.visit_id = v_dup.id));
  end if;

  -- Times and flags.
  begin
    v_at := coalesce((p_payload->>'attended_at')::timestamptz, (p_payload->>'submitted_at')::timestamptz, now());
    v_sms_ok := coalesce((p_payload->>'sms_consent')::boolean, false);
    v_email_ok := coalesce((p_payload->>'email_consent')::boolean, false);
  exception when others then
    raise exception 'submitted_at/attended_at must be ISO dates and consents booleans' using errcode = '22023';
  end;

  -- Names (trimmed, spaces collapsed, ALL CAPS / all lower turned into Title Case).
  v_first := public.intake_normalize_name(p_payload->>'first_name');
  v_last := coalesce(public.intake_normalize_name(p_payload->>'last_name'), '');
  if v_first is null then
    raise exception 'first_name is required' using errcode = '22023';
  end if;
  if length(v_first) > 100 or length(v_last) > 100 then
    raise exception 'names must be 100 characters or fewer' using errcode = '22023';
  end if;

  -- Email: lower-cased; dropped with a warning if it doesn't look like one.
  v_email := nullif(lower(btrim(p_payload->>'email')), '');
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 320) then
    v_email := null;
    v_warnings := array_append(v_warnings, 'email_invalid');
  end if;

  -- Phone: US/Canada only, stored like the app shows it, "(217) 555-0101".
  v_digits := regexp_replace(coalesce(p_payload->>'phone', ''), '\D', '', 'g');
  if length(v_digits) = 11 and left(v_digits, 1) = '1' then
    v_digits := substr(v_digits, 2);
  end if;
  if v_digits ~ '^[2-9][0-9]{9}$' then
    v_phone := format('(%s) %s-%s', substr(v_digits, 1, 3), substr(v_digits, 4, 3), substr(v_digits, 7));
  else
    if v_digits <> '' then
      v_warnings := array_append(v_warnings, 'phone_invalid');
    end if;
    v_digits := null;
  end if;

  if v_city is not null and length(v_city) > 100 then
    v_city := left(v_city, 100);
  end if;
  if v_wording is not null and length(v_wording) > 2000 then
    raise exception 'consent_wording must be 2,000 characters or fewer' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct x) filter (where x <> ''), '{}') into v_interests
  from (
    select left(btrim(value), 100) as x
    from jsonb_array_elements_text(case when jsonb_typeof(p_payload->'interests') = 'array' then p_payload->'interests' else '[]' end)
    limit 30
  ) i;

  -- The service they attended, and its end in UTC.
  select * into v_svc
  from public.intake_resolve_service(v_church.id, v_church.timezone, v_at, nullif(btrim(p_payload->>'service'), ''));
  if not found and nullif(btrim(p_payload->>'service'), '') is not null then
    v_warnings := array_append(v_warnings, 'service_not_found');
    select * into v_svc from public.intake_resolve_service(v_church.id, v_church.timezone, v_at, null);
  end if;
  if v_svc.ends_at is null then
    raise exception 'no_service_schedule' using errcode = 'P0002';
  end if;

  -- Who is this? (guidelines 4.8.3). Confident: same phone or email AND the same name, with no
  -- conflicting phone/email on file -> the existing guest. Anything that overlaps but isn't
  -- confident -> a new guest flagged for staff review, with the possible match recorded.
  select p.* into v_person
  from public.church_people p
  where p.church_id = v_church.id
    and ((v_digits is not null and p.phone_digits = v_digits) or (v_email is not null and lower(p.email) = v_email))
    and lower(p.first_name) = lower(v_first)
    and (v_last = '' or p.last_name = '' or lower(p.last_name) = lower(v_last))
    and not (v_digits is not null and p.phone is not null and p.phone_digits <> v_digits)
    and not (v_email is not null and p.email is not null and lower(p.email) <> v_email)
  order by p.created_at
  limit 1;

  if found then
    v_match := 'existing';
    v_person_id := v_person.id;
    update public.church_people p set
      email = coalesce(p.email, v_email),
      phone = coalesce(p.phone, v_phone),
      city = coalesce(p.city, v_city),
      interests = (select coalesce(array_agg(distinct x), '{}') from unnest(p.interests || v_interests) x),
      stage = case when p.visit_count > 0 and p.stage in ('new', 'thanked', 'contacted', 'engaged') then 'returned' else p.stage end
    where p.id = v_person.id;
  else
    -- Shared contact with a different name, or a new email/phone next to a known one ...
    select p.id into v_candidate
    from public.church_people p
    where p.church_id = v_church.id
      and ((v_digits is not null and p.phone_digits = v_digits) or (v_email is not null and lower(p.email) = v_email))
    order by p.created_at
    limit 1;
    -- ... or the same full name with different contact details.
    if v_candidate is null and v_last <> '' then
      select p.id into v_candidate
      from public.church_people p
      where p.church_id = v_church.id
        and lower(p.first_name) = lower(v_first) and lower(p.last_name) = lower(v_last)
      order by p.created_at
      limit 1;
    end if;

    v_match := case when v_candidate is null then 'new' else 'needs_review' end;

    insert into public.church_people (church_id, first_name, last_name, email, phone, city, interests,
      preferred_channel, needs_review, review_candidate_id)
    values (v_church.id, v_first, v_last, v_email, v_phone, v_city, v_interests,
      case when v_phone is null and v_email is not null then 'email' else 'sms' end,
      v_candidate is not null, v_candidate)
    returning id into v_person_id;

    -- Household, for a new guest only (an existing guest's household is staff-maintained).
    if jsonb_typeof(p_payload->'household') = 'array' then
      insert into public.church_household_members (church_id, person_id, name, relation, age, position)
      select v_church.id, v_person_id,
             public.intake_normalize_name(e.item->>'name'),
             case when e.item->>'relation' in ('spouse', 'child', 'parent') then e.item->>'relation' else 'other' end,
             case when (e.item->>'age') ~ '^[0-9]{1,3}$' and (e.item->>'age')::int <= 120 then (e.item->>'age')::int end,
             e.ord - 1
      from jsonb_array_elements(p_payload->'household') with ordinality as e(item, ord)
      where jsonb_typeof(e.item) = 'object'
        and public.intake_normalize_name(e.item->>'name') is not null
        and length(public.intake_normalize_name(e.item->>'name')) <= 100
        and e.ord <= 10;
    end if;
  end if;

  -- The visit (unique on church, source, submission id).
  insert into public.church_visits (church_id, person_id, visited_at, service_name, source, source_event_id, logged_by)
  values (v_church.id, v_person_id, v_svc.starts_at, v_svc.service_name, v_source, v_sub_id, null)
  returning id into v_visit_id;

  -- Consent, as the guest gave it on this form.
  v_consent_src := case v_source when 'subsplash' then 'subsplash' when 'website' then 'website'
                                 when 'text_in' then 'guest_reply' else 'connect_card' end;
  if v_sms_ok and v_phone is not null then
    insert into public.church_consents (church_id, person_id, channel, status, source, wording, source_event_id, event_at)
    values (v_church.id, v_person_id, 'sms', 'granted', v_consent_src, v_wording, v_sub_id || ':sms', v_at);
  end if;
  if v_email_ok and v_email is not null then
    insert into public.church_consents (church_id, person_id, channel, status, source, wording, source_event_id, event_at)
    values (v_church.id, v_person_id, 'email', 'granted', v_consent_src, v_wording, v_sub_id || ':email', v_at);
  end if;

  -- Prayer request: care content (C3), kept as a fact from the source.
  if nullif(btrim(p_payload->>'prayer_request'), '') is not null then
    insert into public.church_person_facts (church_id, person_id, field, value, data_class, source, source_event_id, event_at, actor)
    values (v_church.id, v_person_id, 'prayer_request', left(btrim(p_payload->>'prayer_request'), 2000), 'C3',
            case when v_source = 'subsplash' then 'subsplash' else 'guest' end, v_sub_id || ':prayer', v_at, null);
  end if;

  -- The thread, on a channel the guest agreed to. No agreed channel -> no thread to contact
  -- them on; staff still see the visit.
  v_channel := case when v_sms_ok and v_phone is not null then 'sms'
                    when v_email_ok and v_email is not null then 'email' end;
  if v_channel is null then
    v_warnings := array_append(v_warnings, case when v_phone is null and v_email is null then 'no_contact' else 'no_consent' end);
  else
    insert into public.church_threads (church_id, person_id, visit_id, channel, service_end_at)
    values (v_church.id, v_person_id, v_visit_id, v_channel, v_svc.ends_at)
    returning id, first_contact_due_at into v_thread_id, v_due;
  end if;

  insert into public.church_audit_log (church_id, thread_id, actor_type, action, details)
  values (v_church.id, v_thread_id, 'webhook', 'intake.received',
          jsonb_build_object('visit_id', v_visit_id, 'person_id', v_person_id, 'match', v_match,
                             'source', v_source, 'warnings', to_jsonb(v_warnings)));

  return jsonb_build_object(
    'status', 'created',
    'person_id', v_person_id,
    'visit_id', v_visit_id,
    'thread_id', v_thread_id,
    'match', v_match,
    'service_end_at', v_svc.ends_at,
    'first_contact_due_at', v_due,
    'warnings', to_jsonb(v_warnings));
end;
$$;

-- Only the server calls this (the route uses the service role); the key check is inside.
revoke execute on function public.intake_guest(text, jsonb) from public, anon, authenticated;
grant execute on function public.intake_guest(text, jsonb) to service_role;
