-- UI-08: change guardrails and re-approve them, and re-approve the first message, from Settings
-- after setup (onboarding is closed once complete, so before this a changed first message could
-- never be approved again).
--
--   save_settings_guardrails()      tone, sign-off, beliefs and practices, topics that always go
--                                   to a person. Any change clears the pastor's approval and puts
--                                   a Live church back in Shadow (same rule as the first message).
--   approve_settings_guardrails()   the church owner approves, under their own name.
--   approve_settings_first_message() the church owner approves the current wording.
--
-- All three are for the church owner (the person who set the church up and approves on the
-- pastor's behalf, as in onboarding). SECURITY INVOKER: RLS still applies. Team & Escalations
-- reuses save_onboarding_team(), which is already owner-only.

-- The owner's church and name, or an error.
create or replace function public.settings_owner()
returns table (church_id uuid, owner_name text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to change settings.' using errcode = '28000';
  end if;
  return query
    select m.church_id, coalesce(nullif(btrim(m.full_name), ''), 'Church owner')
    from public.church_members m
    where m.user_id = auth.uid() and m.is_owner
    order by m.created_at
    limit 1;
  if not found then
    raise exception 'Only the church owner can change this.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.save_settings_guardrails(
  p_positions   jsonb,
  p_escalation  jsonb,
  p_tone        text[],
  p_sign_off    text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_church  uuid;
  v_before  jsonb;
  v_after   jsonb;
  v_tone    text[] := coalesce((select array_agg(btrim(t)) from unnest(coalesce(p_tone, '{}')) t where btrim(t) <> ''), '{}');
begin
  select o.church_id into v_church from public.settings_owner() o;

  if jsonb_typeof(coalesce(p_positions, '[]')) <> 'array' or jsonb_typeof(coalesce(p_escalation, '[]')) <> 'array' then
    raise exception 'Guardrails must be lists.' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_positions, '[]')) > 50 or jsonb_array_length(coalesce(p_escalation, '[]')) > 50 then
    raise exception 'Up to 50 topics each.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_positions, '[]')) e
             where btrim(coalesce(e->>'topic', '')) = '' or coalesce(e->>'stance', '') not in ('explain', 'route', 'skip')
                or (e->>'stance' = 'explain' and btrim(coalesce(e->>'wording', '')) = '')) then
    raise exception 'Each topic needs a name and a choice; "Explain" needs your approved wording.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_escalation, '[]')) e where btrim(coalesce(e->>'label', '')) = '') then
    raise exception 'Escalation topics need a name.' using errcode = '22023';
  end if;

  v_before := public.guardrail_content(v_church);

  insert into public.church_guardrails (church_id, tone, sign_off)
  values (v_church, v_tone, nullif(btrim(p_sign_off), ''))
  on conflict (church_id) do update set tone = excluded.tone, sign_off = excluded.sign_off;

  delete from public.church_doctrinal_positions where church_id = v_church;
  insert into public.church_doctrinal_positions (church_id, client_id, topic, stance, wording, position)
  select v_church, coalesce(nullif(e.item->>'id', ''), gen_random_uuid()::text), btrim(e.item->>'topic'), e.item->>'stance',
         case when e.item->>'stance' = 'explain' then btrim(coalesce(e.item->>'wording', '')) else '' end, e.ord
  from jsonb_array_elements(coalesce(p_positions, '[]')) with ordinality as e(item, ord);

  delete from public.church_escalation_topics where church_id = v_church;
  insert into public.church_escalation_topics (church_id, client_id, label, enabled, position)
  select v_church, coalesce(nullif(e.item->>'id', ''), gen_random_uuid()::text), btrim(e.item->>'label'),
         coalesce((e.item->>'enabled')::boolean, true), e.ord
  from jsonb_array_elements(coalesce(p_escalation, '[]')) with ordinality as e(item, ord);

  v_after := public.guardrail_content(v_church);
  if v_after is distinct from v_before then
    update public.church_guardrails set approved_by = null, approved_at = null where church_id = v_church;
    update public.onboarding_progress set mode = 'shadow' where church_id = v_church and mode = 'live';
  end if;

  return exists (select 1 from public.church_guardrails g where g.church_id = v_church and g.approved_at is not null);
end;
$$;

-- What the pastor approves: everything the assistant follows, without the approval itself.
-- (Order and enabled topics as the assistant sees them; ids don't count.)
create or replace function public.guardrail_content(p_church uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'tone', (select to_jsonb(g.tone) from public.church_guardrails g where g.church_id = p_church),
    'sign_off', (select g.sign_off from public.church_guardrails g where g.church_id = p_church),
    'positions', coalesce((
      select jsonb_agg(jsonb_build_object('topic', d.topic, 'stance', d.stance, 'wording', d.wording) order by d.position, d.topic)
      from public.church_doctrinal_positions d where d.church_id = p_church), '[]'::jsonb),
    'escalation_topics', coalesce((
      select jsonb_agg(e.label order by e.position, e.label)
      from public.church_escalation_topics e where e.church_id = p_church and e.enabled), '[]'::jsonb));
$$;

create or replace function public.approve_settings_guardrails()
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_church  uuid;
  v_name    text;
  v_at      timestamptz := now();
begin
  select o.church_id, o.owner_name into v_church, v_name from public.settings_owner() o;
  update public.church_guardrails set approved_by = v_name, approved_at = v_at where church_id = v_church;
  if not found then
    raise exception 'Set up the guardrails first.' using errcode = 'P0002';
  end if;
  return v_at;
end;
$$;

create or replace function public.approve_settings_first_message()
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_church  uuid;
  v_name    text;
  v_at      timestamptz := now();
begin
  select o.church_id, o.owner_name into v_church, v_name from public.settings_owner() o;
  if not exists (
    select 1 from public.church_first_message f
    join public.church_message_templates t on t.church_id = f.church_id and t.client_id = f.selected_template
    where f.church_id = v_church and position('Reply STOP to opt out' in t.body) > 0
  ) then
    raise exception 'The first message needs wording that includes "Reply STOP to opt out".' using errcode = 'P0002';
  end if;
  update public.church_first_message set status = 'approved', approved_by = v_name, approved_at = v_at where church_id = v_church;
  return v_at;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.settings_owner()',
    'public.save_settings_guardrails(jsonb, jsonb, text[], text)',
    'public.guardrail_content(uuid)',
    'public.approve_settings_guardrails()',
    'public.approve_settings_first_message()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
