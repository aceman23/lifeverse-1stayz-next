-- WP-7a: AI groundwork (AI-01 rest, AI-03, AI-06).
--
--   Guardrail versions   Each distinct pastor-approved guardrail configuration gets a version
--                        number (church_guardrail_versions). current_guardrail_version() snapshots
--                        the approved config and returns its version; every model-call audit row
--                        carries it, so we can always say which rules a model decision ran under.
--                        No approval = no version = no model calls for that church.
--   Data-class tagging   Messages start as C3 (strictest). The tagger (src/lib/messaging/tagger.ts)
--                        claims untagged messages, applies rules first and the fast model second,
--                        and records the class here. It only ever errs toward the stricter class,
--                        and every decision is audited (guidelines §3).
--   Model-call audit     log_model_call(): model, guardrail version, Tier-2 decision, tokens,
--                        latency. Ids and labels only, never prompts or replies (§4.4, §4.5).
--
-- All functions here are for the server (service role) only.

-- ---------------------------------------------------------------------------
-- Guardrail versions
-- ---------------------------------------------------------------------------
create table public.church_guardrail_versions (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references public.churches (id) on delete cascade,
  version      int not null check (version > 0),
  -- The approved configuration (C4): tone, sign-off, doctrinal positions, escalation topics,
  -- reference document names, who approved it and when.
  config       jsonb not null,
  config_hash  text not null check (config_hash ~ '^[0-9a-f]{32}$'),
  approved_by  text,
  approved_at  timestamptz not null,
  created_at   timestamptz not null default now(),
  unique (church_id, version),
  unique (church_id, config_hash)
);

comment on table public.church_guardrail_versions is 'Each distinct approved guardrail configuration, numbered per church. Written by the server only.';

revoke all on public.church_guardrail_versions from anon, authenticated;
grant select on public.church_guardrail_versions to authenticated;
create policy "church_guardrail_versions: members can read" on public.church_guardrail_versions
  for select to authenticated using (public.is_church_member(church_id));

-- The church's guardrail configuration as it is now, or null if the pastor hasn't approved it.
create or replace function public.guardrail_snapshot(p_church uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tone', to_jsonb(g.tone),
    'sign_off', g.sign_off,
    'approved_by', g.approved_by,
    'approved_at', g.approved_at,
    'positions', coalesce((
      select jsonb_agg(jsonb_build_object('topic', d.topic, 'stance', d.stance, 'wording', d.wording) order by d.position, d.topic)
      from public.church_doctrinal_positions d where d.church_id = p_church), '[]'::jsonb),
    'escalation_topics', coalesce((
      select jsonb_agg(e.label order by e.position, e.label)
      from public.church_escalation_topics e where e.church_id = p_church and e.enabled), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(doc.name order by doc.position, doc.name)
      from public.church_documents doc where doc.church_id = p_church), '[]'::jsonb))
  from public.church_guardrails g
  where g.church_id = p_church and g.approved_at is not null;
$$;

-- The version of the church's approved guardrails right now (a new one if the approved config
-- changed since the last version), and that config. Null version if not approved.
create or replace function public.current_guardrail_version(p_church uuid)
returns table (version int, config jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config  jsonb := public.guardrail_snapshot(p_church);
  v_hash    text;
  v_version int;
begin
  if v_config is null then
    version := null;
    config := null;
    return next;
    return;
  end if;
  v_hash := md5(v_config::text);

  select gv.version into v_version from public.church_guardrail_versions gv
  where gv.church_id = p_church and gv.config_hash = v_hash;

  if v_version is null then
    -- One writer per church at a time, so versions never collide.
    perform pg_advisory_xact_lock(hashtextextended('guardrail_version:' || p_church::text, 0));
    select gv.version into v_version from public.church_guardrail_versions gv
    where gv.church_id = p_church and gv.config_hash = v_hash;
    if v_version is null then
      select coalesce(max(gv.version), 0) + 1 into v_version from public.church_guardrail_versions gv where gv.church_id = p_church;
      insert into public.church_guardrail_versions (church_id, version, config, config_hash, approved_by, approved_at)
      values (p_church, v_version, v_config, v_hash, v_config->>'approved_by', (v_config->>'approved_at')::timestamptz);
      insert into public.church_audit_log (church_id, actor_type, action, guardrail_version, details)
      values (p_church, 'system', 'guardrails.versioned', v_version, jsonb_build_object('config_hash', v_hash));
    end if;
  end if;

  version := v_version;
  config := v_config;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Data-class tagging
-- ---------------------------------------------------------------------------
alter table public.church_messages
  -- How data_class was set: 'default' (C3 until tagged), 'rules', 'model', or 'staff'.
  add column data_class_source    text not null default 'default'
                                    check (data_class_source in ('default', 'rules', 'model', 'staff')),
  add column data_class_at        timestamptz,
  -- Failed tagging attempts (model unavailable or unclear); the message stays C3 after 3.
  add column data_class_attempts  int not null default 0 check (data_class_attempts >= 0);

create index church_messages_untagged_idx on public.church_messages (created_at)
  where data_class_source = 'default' and event_type = 'message' and body is not null;

-- Untagged messages for the tagger, oldest first, with the names that would identify the guest
-- (C1) so the rules can spot them. Names stay on the server; they're never sent to a model.
create or replace function public.claim_untagged_messages(p_limit int default 50)
returns table (message_id uuid, church_id uuid, thread_id uuid, body text, direction text, sender text, names text[])
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.church_id, m.thread_id, m.body, m.direction, m.sender,
         array_remove(array[p.first_name, p.last_name] || coalesce((
           select array_agg(h.name) from public.church_household_members h
           where h.church_id = p.church_id and h.person_id = p.id), '{}'), null)
  from public.church_messages m
  join public.church_threads t on t.church_id = m.church_id and t.id = m.thread_id
  join public.church_people p on p.church_id = t.church_id and p.id = t.person_id
  where m.data_class_source = 'default' and m.event_type = 'message' and m.body is not null
    and m.data_class_attempts < 3
  order by m.created_at
  limit least(greatest(p_limit, 1), 200);
$$;

-- Records the tagger's decision. p_detail: rule and label names only (never message text).
-- Returns false if the message was already tagged (another run got there first).
create or replace function public.tag_message_data_class(p_message uuid, p_class text, p_source text, p_detail jsonb default '{}')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.church_messages%rowtype;
begin
  if p_class not in ('C1', 'C2', 'C3', 'C4', 'C5', 'C6') or p_source not in ('rules', 'model') then
    raise exception 'tag_message_data_class: invalid class or source' using errcode = '22023';
  end if;

  update public.church_messages
  set data_class = p_class, data_class_source = p_source, data_class_at = now()
  where id = p_message and data_class_source = 'default'
  returning * into m;
  if m.id is null then
    return false;
  end if;

  insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, action, reason, details)
  values (m.church_id, m.thread_id, m.id, case when p_source = 'model' then 'model' else 'system' end,
          'message.classified', p_class, jsonb_build_object('source', p_source) || coalesce(p_detail, '{}'::jsonb));
  return true;
end;
$$;

-- The tagger couldn't decide (no model, or an unclear answer): try again later, at most 3 times.
create or replace function public.note_tag_attempt(p_message uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.church_messages set data_class_attempts = data_class_attempts + 1
  where id = p_message and data_class_source = 'default';
$$;

-- ---------------------------------------------------------------------------
-- Model-call audit
-- ---------------------------------------------------------------------------
-- p_purpose: what the call was for ('data_class', later 'reply', 'escalation', ...).
create or replace function public.log_model_call(
  p_church uuid, p_thread uuid, p_message uuid, p_purpose text, p_model text, p_guardrail_version int,
  p_tier2 text, p_tokens_in int, p_tokens_out int, p_latency_ms int, p_details jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.church_audit_log
    (church_id, thread_id, message_id, actor_type, action, reason, model, guardrail_version, tier2_decision,
     tokens_in, tokens_out, latency_ms, details)
  values
    (p_church, p_thread, p_message, 'model', 'model.call', left(p_purpose, 60), left(p_model, 100), p_guardrail_version,
     p_tier2, greatest(p_tokens_in, 0), greatest(p_tokens_out, 0), greatest(p_latency_ms, 0), coalesce(p_details, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- Privileges: the server only
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.guardrail_snapshot(uuid)',
    'public.current_guardrail_version(uuid)',
    'public.claim_untagged_messages(int)',
    'public.tag_message_data_class(uuid, text, text, jsonb)',
    'public.note_tag_attempt(uuid)',
    'public.log_model_call(uuid, uuid, uuid, text, text, int, text, int, int, int, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
