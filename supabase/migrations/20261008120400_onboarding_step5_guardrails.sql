-- Onboarding step 5 (Guardrails): reference documents, doctrinal positions, topics that go
-- to a pastor, tone, sign-off and the pastor's approval.
--
-- Run after 20261008120300_onboarding_step4_systems.sql.

create table public.church_guardrails (
  church_id    uuid primary key references public.churches (id) on delete cascade,
  tone         text[] not null default '{}',
  sign_off     text check (length(sign_off) <= 200),
  -- Name shown in "Approved by ... on ...". NULL until the pastor approves.
  approved_by  text check (length(approved_by) <= 200),
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((approved_by is null) = (approved_at is null))
);

-- Only names and types for now: the files themselves aren't uploaded yet.
create table public.church_documents (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches (id) on delete cascade,
  client_id   text not null,
  name        text not null check (length(name) <= 300),
  mime_type   text not null default '' check (length(mime_type) <= 200),
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  unique (church_id, client_id)
);

-- What the assistant does when a guest asks about a topic: explain the church's view,
-- route the question to a pastor, or not engage.
create table public.church_doctrinal_positions (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches (id) on delete cascade,
  client_id   text not null,
  topic       text not null check (length(topic) <= 200),
  stance      text not null default 'route' check (stance in ('explain', 'route', 'skip')),
  wording     text not null default '' check (length(wording) <= 4000),
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  unique (church_id, client_id)
);

-- Topics that always go to a pastor.
create table public.church_escalation_topics (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches (id) on delete cascade,
  client_id   text not null,
  label       text not null check (length(label) <= 200),
  enabled     boolean not null default true,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  unique (church_id, client_id)
);

create index church_documents_church_id_idx on public.church_documents (church_id);
create index church_doctrinal_positions_church_id_idx on public.church_doctrinal_positions (church_id);
create index church_escalation_topics_church_id_idx on public.church_escalation_topics (church_id);

create trigger church_guardrails_set_updated_at
  before update on public.church_guardrails
  for each row execute function public.set_updated_at();

-- Row level security: church members can read and write their church's rows
do $$
declare
  t text;
begin
  foreach t in array array['church_guardrails', 'church_documents', 'church_doctrinal_positions', 'church_escalation_topics'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: members can read" on public.%I for select to authenticated using (public.is_church_member(church_id))', t, t);
    execute format('create policy "%s: members can insert" on public.%I for insert to authenticated with check (public.is_church_member(church_id))', t, t);
    execute format('create policy "%s: members can update" on public.%I for update to authenticated using (public.is_church_member(church_id)) with check (public.is_church_member(church_id))', t, t);
    execute format('create policy "%s: members can delete" on public.%I for delete to authenticated using (public.is_church_member(church_id))', t, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- Step 5 save. The lists are replaced in the order given.
-- p_documents:  [{ "id", "name", "type" }]
-- p_positions:  [{ "id", "topic", "stance", "wording" }]
-- p_escalation: [{ "id", "label", "enabled" }]
create or replace function public.save_onboarding_guardrails(
  p_documents    jsonb,
  p_positions    jsonb,
  p_escalation   jsonb,
  p_tone         text[],
  p_sign_off     text,
  p_approved_by  text,
  p_approved_at  timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_church uuid := public.onboarding_church_id();
begin
  insert into public.church_guardrails (church_id, tone, sign_off, approved_by, approved_at)
  values (
    v_church,
    coalesce(p_tone, '{}'),
    nullif(btrim(p_sign_off), ''),
    nullif(btrim(p_approved_by), ''),
    case when nullif(btrim(p_approved_by), '') is null then null else p_approved_at end
  )
  on conflict (church_id) do update set
    tone        = excluded.tone,
    sign_off    = excluded.sign_off,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at;

  delete from public.church_documents where church_id = v_church;
  insert into public.church_documents (church_id, client_id, name, mime_type, position)
  select v_church, e.item->>'id', e.item->>'name', coalesce(e.item->>'type', ''), e.ord
  from jsonb_array_elements(coalesce(p_documents, '[]')) with ordinality as e(item, ord);

  delete from public.church_doctrinal_positions where church_id = v_church;
  insert into public.church_doctrinal_positions (church_id, client_id, topic, stance, wording, position)
  select v_church, e.item->>'id', e.item->>'topic', coalesce(e.item->>'stance', 'route'), coalesce(e.item->>'wording', ''), e.ord
  from jsonb_array_elements(coalesce(p_positions, '[]')) with ordinality as e(item, ord);

  delete from public.church_escalation_topics where church_id = v_church;
  insert into public.church_escalation_topics (church_id, client_id, label, enabled, position)
  select v_church, e.item->>'id', e.item->>'label', coalesce((e.item->>'enabled')::boolean, true), e.ord
  from jsonb_array_elements(coalesce(p_escalation, '[]')) with ordinality as e(item, ord);

  perform public.onboarding_mark_saved(v_church, 4);
end;
$$;

revoke execute on function public.save_onboarding_guardrails(jsonb, jsonb, jsonb, text[], text, text, timestamptz) from public, anon;
grant execute on function public.save_onboarding_guardrails(jsonb, jsonb, jsonb, text[], text, text, timestamptz) to authenticated;
