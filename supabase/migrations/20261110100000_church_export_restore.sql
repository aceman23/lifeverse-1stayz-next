-- DB-06: per-church export and per-church restore.
--
-- Supabase's own backups restore the whole database. A pilot church needs its own copy: to hand
-- the church its data (owner download in Settings), and to put back one church after a mistake
-- without rolling back every other church.
--
--   church_backup_tables()          the church's tables, parents first (the restore order)
--   export_church(church)           service only: every row of the church, as one JSON document
--   restore_church(doc, replace)    service only: loads that document back, for that church only
--   export_church_data()            the signed-in owner's own church, without secrets; audited
--
-- The document: { format: "1stayz.church-export", version: 1, church_id, exported_at,
-- tables: { <table>: [rows] } }. Rows are as stored, so a restore is exact: an export taken after
-- the restore equals the one it came from (tested in church_export_restore_test.sql).
-- security_events stays out: those are 1Stayz's records about a church, not the church's data.

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
revoke execute on function public.church_backup_tables() from public, anon, authenticated;
grant execute on function public.church_backup_tables() to service_role;

-- ---------------------------------------------------------------------------
-- Export (service only): everything, exactly as stored
-- ---------------------------------------------------------------------------
create or replace function public.export_church(p_church uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tables jsonb := '{}'::jsonb;
  v_rows   jsonb;
  t        text;
begin
  if not exists (select 1 from public.churches where id = p_church) then
    raise exception 'export_church: no such church' using errcode = 'P0002';
  end if;
  foreach t in array public.church_backup_tables() loop
    -- Sorted by the row's own text, so two exports of the same data are identical.
    execute format(
      'select coalesce(jsonb_agg(r order by r::text), ''[]''::jsonb) from (select to_jsonb(x) as r from public.%I x where x.%I = $1) s',
      t, case when t = 'churches' then 'id' else 'church_id' end)
      into v_rows using p_church;
    v_tables := v_tables || jsonb_build_object(t, v_rows);
  end loop;
  return jsonb_build_object(
    'format', '1stayz.church-export',
    'version', 1,
    'church_id', p_church,
    'exported_at', now(),
    'tables', v_tables);
end;
$$;
revoke execute on function public.export_church(uuid) from public, anon, authenticated;
grant execute on function public.export_church(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Restore (service only): one church back from its export
-- ---------------------------------------------------------------------------
-- Refuses a document for another church, a table it doesn't know, or a row that names another
-- church. If the church still exists, p_replace must be true: its current data is deleted first
-- (the audit log is append-only, so audit rows that survived are kept and the copies skipped).
--
-- Rows go back exactly as exported: the tables' triggers are switched off while loading (they
-- would recompute timestamps, bump thread versions, queue alerts again), so this takes a brief
-- lock on each table. Foreign keys stay on, so every user the church refers to must still exist.
-- Returns the number of rows loaded per table.
create or replace function public.restore_church(p_doc jsonb, p_replace boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_church  uuid;
  v_counts  jsonb := '{}'::jsonb;
  v_tables  text[] := public.church_backup_tables();
  v_rows    jsonb;
  v_cols    text;
  v_n       int;
  v_key     text;
  t         text;
begin
  if p_doc is null or p_doc->>'format' is distinct from '1stayz.church-export' or p_doc->>'version' is distinct from '1' then
    raise exception 'restore_church: not a 1Stayz church export (version 1)' using errcode = '22023';
  end if;
  begin
    v_church := (p_doc->>'church_id')::uuid;
  exception when others then
    raise exception 'restore_church: church_id is missing or invalid' using errcode = '22023';
  end;
  if v_church is null or jsonb_typeof(p_doc->'tables') is distinct from 'object' then
    raise exception 'restore_church: church_id and tables are required' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_doc->'tables') loop
    if not v_key = any (v_tables) then
      raise exception 'restore_church: unknown table %', v_key using errcode = '22023';
    end if;
    if jsonb_typeof(p_doc->'tables'->v_key) is distinct from 'array' then
      raise exception 'restore_church: % is not a list of rows', v_key using errcode = '22023';
    end if;
  end loop;
  if jsonb_array_length(coalesce(p_doc->'tables'->'churches', '[]')) <> 1 then
    raise exception 'restore_church: the export must hold exactly one church row' using errcode = '22023';
  end if;
  -- Every row belongs to this church: nothing in the file can write into another tenant.
  foreach t in array v_tables loop
    if exists (
      select 1 from jsonb_array_elements(coalesce(p_doc->'tables'->t, '[]')) r
      where (r->>(case when t = 'churches' then 'id' else 'church_id' end)) is distinct from v_church::text
    ) then
      raise exception 'restore_church: % has a row for another church', t using errcode = '22023';
    end if;
  end loop;

  if exists (select 1 from public.churches where id = v_church) then
    if not p_replace then
      raise exception 'restore_church: this church still exists; pass replace to overwrite it' using errcode = '23505';
    end if;
    delete from public.churches where id = v_church;   -- cascades to every church table
  end if;

  foreach t in array v_tables loop
    v_rows := coalesce(p_doc->'tables'->t, '[]'::jsonb);
    -- Every stored column except generated ones (those are recomputed).
    select string_agg(format('%I', a.attname), ', ' order by a.attnum) into v_cols
    from pg_attribute a
    where a.attrelid = format('public.%I', t)::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';

    execute format('alter table public.%I disable trigger user', t);
    if t = 'church_people' then
      -- A person can point at another person (review_candidate_id): load, then link.
      execute format(
        'insert into public.church_people (%s) overriding system value select %s from jsonb_populate_recordset(null::public.church_people, $1) on conflict do nothing',
        v_cols, replace(v_cols, '"review_candidate_id"', 'null::uuid'))
        using v_rows;
      get diagnostics v_n = row_count;
      update public.church_people p set review_candidate_id = r.review_candidate_id
      from jsonb_populate_recordset(null::public.church_people, v_rows) r
      where p.church_id = v_church and p.id = r.id and r.review_candidate_id is not null;
    else
      execute format(
        'insert into public.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing',
        t, v_cols, v_cols, t)
        using v_rows;
      get diagnostics v_n = row_count;
    end if;
    execute format('alter table public.%I enable trigger user', t);
    v_counts := v_counts || jsonb_build_object(t, v_n);
  end loop;

  -- Identity columns: keep their sequences ahead of the ids just loaded.
  perform setval(pg_get_serial_sequence('public.church_audit_log', 'id'),
                 greatest((select max(id) from public.church_audit_log), 1));
  perform setval(pg_get_serial_sequence('public.church_prompt_log', 'id'),
                 greatest((select max(id) from public.church_prompt_log), 1));

  insert into public.church_audit_log (church_id, actor_type, action, details)
  values (v_church, 'system', 'church.restored',
          jsonb_build_object('exported_at', p_doc->>'exported_at', 'replaced', p_replace, 'rows', v_counts));
  return v_counts;
end;
$$;
revoke execute on function public.restore_church(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.restore_church(jsonb, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- The owner's download (Settings > Data)
-- ---------------------------------------------------------------------------
-- The owner's own church only. Secrets are left out (intake key hashes). Every download is
-- written to the audit log: guest details leave the system, so who and when is recorded.
create or replace function public.export_church_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_church uuid;
  v_doc    jsonb;
begin
  select o.church_id into v_church from public.settings_owner() o limit 1;
  if v_church is null then
    raise exception 'Only the church owner can download the church''s data.' using errcode = '42501';
  end if;
  v_doc := public.export_church(v_church);
  v_doc := jsonb_set(v_doc, '{tables,church_intake_keys}',
    coalesce((select jsonb_agg(k - 'key_hash') from jsonb_array_elements(v_doc->'tables'->'church_intake_keys') k), '[]'::jsonb));
  v_doc := v_doc || jsonb_build_object('purpose', 'owner_download');
  insert into public.church_audit_log (church_id, actor_type, actor_user_id, action, details)
  values (v_church, 'staff', auth.uid(), 'church.data_exported',
          jsonb_build_object('tables', (select count(*) from jsonb_object_keys(v_doc->'tables'))));
  return v_doc;
end;
$$;
revoke execute on function public.export_church_data() from public, anon;
grant execute on function public.export_church_data() to authenticated;
