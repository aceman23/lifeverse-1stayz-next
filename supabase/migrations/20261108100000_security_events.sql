-- DB-08 / AI-05: security events are stored, not only logged.
--
--   security_events          one row per event: kind, church (when known), ids and codes only,
--                            never message text, names, phone numbers or email addresses
--   record_security_event()  server only; a tenant mismatch also alerts the 1Stayz on-call
--
-- Kinds:
--   tenant_mismatch          the assistant's context held an item from another church (ISO-2);
--                            nothing was sent to a model
--   webhook_bad_signature    a Twilio or Resend webhook failed its signature check
--   intake_bad_key           /api/intake called with an unknown or revoked key
--   cross_tenant_denied      a request named a row of another church and got nothing (ISO-1/3)
-- Read by 1Stayz on-call through the service role (runbook 5.6); churches don't see it.

create table public.security_events (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('tenant_mismatch', 'webhook_bad_signature', 'intake_bad_key', 'cross_tenant_denied')),
  church_id   uuid references public.churches (id) on delete set null,
  thread_id   uuid,
  source      text not null check (source ~ '^[a-z0-9_.:-]{1,60}$'),
  details     jsonb not null default '{}'::jsonb check (pg_column_size(details) <= 2000),
  created_at  timestamptz not null default now()
);
comment on table public.security_events is 'Security events (ids and codes only). Server only; read by 1Stayz on-call.';
create index security_events_recent_idx on public.security_events (created_at desc);
create index security_events_church_idx on public.security_events (church_id, created_at desc) where church_id is not null;
revoke all on public.security_events from anon, authenticated;

create or replace function public.record_security_event(
  p_kind    text,
  p_source  text,
  p_church  uuid default null,
  p_thread  uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.security_events (kind, church_id, thread_id, source, details)
  values (p_kind, p_church, p_thread, p_source, coalesce(p_details, '{}'::jsonb))
  returning id into v_id;

  -- A tenant mismatch is a possible isolation failure: the on-call hears about it at once.
  if p_kind = 'tenant_mismatch' and p_church is not null then
    insert into public.church_notifications (church_id, thread_id, kind, audience, channel, payload, dedupe_key)
    values (p_church, p_thread, 'alert', 'ops', 'email',
            jsonb_build_object('alert_kind', 'security_tenant_mismatch', 'reason', p_source),
            'security:' || v_id)
    on conflict (church_id, dedupe_key) do nothing;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.record_security_event(text, text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_security_event(text, text, uuid, uuid, jsonb) to service_role;
