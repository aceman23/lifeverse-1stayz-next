-- AI-07: the per-church eval (npm run eval:church -- <church id>) runs the assistant on 20 cases
-- generated from one church's config. It needs that church's config exactly as the assistant gets
-- it, without a guest: agent_church_context() returns the same `church` and `guardrails` parts as
-- agent_context(thread). Each run is recorded in the church's audit log (eval.church_run) with
-- the guardrail version it tested, so a version bump without a passing run is visible.
-- Service only.

create or replace function public.agent_church_context(p_church uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  gv record;
begin
  if not exists (select 1 from public.churches where id = p_church) then
    return null;
  end if;
  select * into gv from public.current_guardrail_version(p_church);
  return jsonb_build_object(
    'church', (
      select jsonb_build_object(
        'church_id', c.id, 'name', c.name, 'timezone', c.timezone, 'website', c.website, 'address', c.address,
        'services', coalesce((
          select jsonb_agg(jsonb_build_object('name', s.name, 'day', s.day, 'start', s.start_time, 'end', s.end_time) order by s.position)
          from public.church_services s where s.church_id = c.id and s.start_time is not null), '[]'::jsonb),
        'ministries', coalesce((select to_jsonb(sp.ministries) from public.church_site_profile sp where sp.church_id = c.id), '[]'::jsonb))
      from public.churches c where c.id = p_church),
    'guardrails', jsonb_build_object('church_id', p_church, 'version', gv.version, 'config', gv.config));
end;
$$;

-- One audit row per run: counts and the failing case ids only (no replies).
create or replace function public.record_church_eval(p_church uuid, p_guardrail_version int, p_summary jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_column_size(p_summary) > 4000 then
    raise exception 'record_church_eval: summary too large' using errcode = '22023';
  end if;
  insert into public.church_audit_log (church_id, actor_type, action, guardrail_version, details)
  values (p_church, 'system', 'eval.church_run', p_guardrail_version, p_summary);
end;
$$;

revoke execute on function public.agent_church_context(uuid) from public, anon, authenticated;
grant execute on function public.agent_church_context(uuid) to service_role;
revoke execute on function public.record_church_eval(uuid, int, jsonb) from public, anon, authenticated;
grant execute on function public.record_church_eval(uuid, int, jsonb) to service_role;
