-- Onboarding step 7 (First Message): the connection card consent wording is now editable.
-- Stored with a {church_name} placeholder; null means the app's default wording.
--
-- Run after 20261008130000_lockdown_public_schema.sql.

alter table public.church_first_message
  add column consent_wording text check (length(consent_wording) <= 2000);

-- The save function gains p_consent_wording. Drop the old signature so callers can't hit it.
drop function public.save_onboarding_first_message(jsonb, text, text, text, timestamptz, boolean);

-- Step 7 save. Replaces the templates in the order given.
-- p_templates: [{ "id", "name", "body" }]
create or replace function public.save_onboarding_first_message(
  p_templates             jsonb,
  p_selected_template     text,
  p_status                text,
  p_approved_by           text,
  p_approved_at           timestamptz,
  p_consent_wording_live  boolean,
  p_consent_wording       text
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

  insert into public.church_first_message (church_id, selected_template, status, approved_by, approved_at, consent_wording)
  values (
    v_church,
    p_selected_template,
    p_status,
    case when v_approved then nullif(btrim(p_approved_by), '') end,
    case when v_approved then p_approved_at end,
    nullif(btrim(p_consent_wording), '')
  )
  on conflict (church_id) do update set
    selected_template = excluded.selected_template,
    status            = excluded.status,
    approved_by       = excluded.approved_by,
    approved_at       = excluded.approved_at,
    consent_wording   = excluded.consent_wording;

  -- The consent checkbox is on this step, but the flag lives with the other integrations.
  insert into public.church_integrations (church_id, consent_wording_live)
  values (v_church, coalesce(p_consent_wording_live, false))
  on conflict (church_id) do update set consent_wording_live = excluded.consent_wording_live;

  perform public.onboarding_mark_saved(v_church, 6);
end;
$$;

revoke execute on function public.save_onboarding_first_message(jsonb, text, text, text, timestamptz, boolean, text) from public, anon;
grant execute on function public.save_onboarding_first_message(jsonb, text, text, text, timestamptz, boolean, text) to authenticated;
