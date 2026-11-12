-- Onboarding step 7 (First Message): the message templates as the church edited them,
-- which one is used, the pastor's approval, and whether the consent wording is live.
--
-- Run after 20261008120500_onboarding_step6_team.sql.

create table public.church_message_templates (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches (id) on delete cascade,
  -- Template key from MESSAGE_TEMPLATES, e.g. 'warm'.
  client_id   text not null,
  name        text not null check (length(name) <= 200),
  body        text not null default '' check (length(body) <= 2000),
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  unique (church_id, client_id)
);

create index church_message_templates_church_id_idx on public.church_message_templates (church_id);

create table public.church_first_message (
  church_id          uuid primary key references public.churches (id) on delete cascade,
  selected_template  text not null default 'warm',
  status             text not null default 'draft' check (status in ('draft', 'awaiting', 'approved')),
  approved_by        text check (length(approved_by) <= 200),
  approved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger church_first_message_set_updated_at
  before update on public.church_first_message
  for each row execute function public.set_updated_at();

-- Row level security: church members can read and write their church's rows
do $$
declare
  t text;
begin
  foreach t in array array['church_message_templates', 'church_first_message'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: members can read" on public.%I for select to authenticated using (public.is_church_member(church_id))', t, t);
    execute format('create policy "%s: members can insert" on public.%I for insert to authenticated with check (public.is_church_member(church_id))', t, t);
    execute format('create policy "%s: members can update" on public.%I for update to authenticated using (public.is_church_member(church_id)) with check (public.is_church_member(church_id))', t, t);
    execute format('create policy "%s: members can delete" on public.%I for delete to authenticated using (public.is_church_member(church_id))', t, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- Step 7 save. Replaces the templates in the order given.
-- p_templates: [{ "id", "name", "body" }]
create or replace function public.save_onboarding_first_message(
  p_templates             jsonb,
  p_selected_template     text,
  p_status                text,
  p_approved_by           text,
  p_approved_at           timestamptz,
  p_consent_wording_live  boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_church   uuid := public.onboarding_church_id();
  v_approved boolean := p_status = 'approved';
begin
  delete from public.church_message_templates where church_id = v_church;
  insert into public.church_message_templates (church_id, client_id, name, body, position)
  select v_church, e.item->>'id', e.item->>'name', coalesce(e.item->>'body', ''), e.ord
  from jsonb_array_elements(coalesce(p_templates, '[]')) with ordinality as e(item, ord);

  insert into public.church_first_message (church_id, selected_template, status, approved_by, approved_at)
  values (
    v_church,
    p_selected_template,
    p_status,
    case when v_approved then nullif(btrim(p_approved_by), '') end,
    case when v_approved then p_approved_at end
  )
  on conflict (church_id) do update set
    selected_template = excluded.selected_template,
    status            = excluded.status,
    approved_by       = excluded.approved_by,
    approved_at       = excluded.approved_at;

  -- The consent checkbox is on this step, but the flag lives with the other integrations.
  insert into public.church_integrations (church_id, consent_wording_live)
  values (v_church, coalesce(p_consent_wording_live, false))
  on conflict (church_id) do update set consent_wording_live = excluded.consent_wording_live;

  perform public.onboarding_mark_saved(v_church, 6);
end;
$$;

revoke execute on function public.save_onboarding_first_message(jsonb, text, text, text, timestamptz, boolean) from public, anon;
grant execute on function public.save_onboarding_first_message(jsonb, text, text, text, timestamptz, boolean) to authenticated;
