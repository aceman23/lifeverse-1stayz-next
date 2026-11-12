-- Onboarding step 6 (Team & Escalations): staff, who gets which alerts, the escalation
-- order, quiet hours and staff text alerts.
--
-- Run after 20261008120400_onboarding_step5_guardrails.sql.

-- Staff contacts. Not necessarily 1Stayz users, so they aren't church_members.
create table public.church_staff (
  id                    uuid primary key default gen_random_uuid(),
  church_id             uuid not null references public.churches (id) on delete cascade,
  client_id             text not null,
  name                  text not null default '' check (length(name) <= 200),
  role                  text not null default '' check (length(role) <= 100),
  mobile                text not null default '' check (length(mobile) <= 40),
  email                 text not null default '' check (length(email) <= 320),
  receives_escalations  boolean not null default false,
  receives_care         boolean not null default false,
  receives_general      boolean not null default false,
  -- 1 = contacted first when someone needs a pastor. NULL = not in the escalation order.
  escalation_rank       int check (escalation_rank > 0),
  position              int not null default 0,
  created_at            timestamptz not null default now(),
  unique (church_id, client_id)
);

create index church_staff_church_id_idx on public.church_staff (church_id);

create table public.church_team_settings (
  church_id                   uuid primary key references public.churches (id) on delete cascade,
  -- No messages to guests between these times, in the guest's local time.
  quiet_hours_start           time,
  quiet_hours_end             time,
  staff_alerts_enabled        boolean not null default true,
  staff_alerts_phone          text check (length(staff_alerts_phone) <= 40),
  staff_alerts_consent        boolean not null default false,
  -- When the consent box was first ticked; kept for SMS compliance.
  staff_alerts_consented_at   timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create trigger church_team_settings_set_updated_at
  before update on public.church_team_settings
  for each row execute function public.set_updated_at();

-- Row level security: church members can read and write their church's rows
do $$
declare
  t text;
begin
  foreach t in array array['church_staff', 'church_team_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: members can read" on public.%I for select to authenticated using (public.is_church_member(church_id))', t, t);
    execute format('create policy "%s: members can insert" on public.%I for insert to authenticated with check (public.is_church_member(church_id))', t, t);
    execute format('create policy "%s: members can update" on public.%I for update to authenticated using (public.is_church_member(church_id)) with check (public.is_church_member(church_id))', t, t);
    execute format('create policy "%s: members can delete" on public.%I for delete to authenticated using (public.is_church_member(church_id))', t, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- Step 6 save. Replaces the staff list in the order given.
-- p_staff: [{ "id", "name", "role", "mobile", "email",
--             "receivesEscalations", "receivesCare", "receivesGeneral" }]
-- p_escalation_order: staff "id"s, first contact first.
create or replace function public.save_onboarding_team(
  p_staff                 jsonb,
  p_escalation_order      text[],
  p_quiet_hours_start     text,
  p_quiet_hours_end       text,
  p_staff_alerts_enabled  boolean,
  p_staff_alerts_phone    text,
  p_staff_alerts_consent  boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_church uuid := public.onboarding_church_id();
begin
  delete from public.church_staff where church_id = v_church;

  insert into public.church_staff (
    church_id, client_id, name, role, mobile, email,
    receives_escalations, receives_care, receives_general, escalation_rank, position
  )
  select
    v_church,
    e.item->>'id',
    coalesce(e.item->>'name', ''),
    coalesce(e.item->>'role', ''),
    coalesce(e.item->>'mobile', ''),
    coalesce(e.item->>'email', ''),
    coalesce((e.item->>'receivesEscalations')::boolean, false),
    coalesce((e.item->>'receivesCare')::boolean, false),
    coalesce((e.item->>'receivesGeneral')::boolean, false),
    -- Only staff who receive escalations get a rank.
    case when coalesce((e.item->>'receivesEscalations')::boolean, false)
      then array_position(p_escalation_order, e.item->>'id') end,
    e.ord
  from jsonb_array_elements(coalesce(p_staff, '[]')) with ordinality as e(item, ord);

  insert into public.church_team_settings (
    church_id, quiet_hours_start, quiet_hours_end, staff_alerts_enabled,
    staff_alerts_phone, staff_alerts_consent, staff_alerts_consented_at
  )
  values (
    v_church,
    nullif(p_quiet_hours_start, '')::time,
    nullif(p_quiet_hours_end, '')::time,
    coalesce(p_staff_alerts_enabled, true),
    nullif(btrim(p_staff_alerts_phone), ''),
    coalesce(p_staff_alerts_consent, false),
    case when p_staff_alerts_consent then now() end
  )
  on conflict (church_id) do update set
    quiet_hours_start         = excluded.quiet_hours_start,
    quiet_hours_end           = excluded.quiet_hours_end,
    staff_alerts_enabled      = excluded.staff_alerts_enabled,
    staff_alerts_phone        = excluded.staff_alerts_phone,
    staff_alerts_consent      = excluded.staff_alerts_consent,
    -- Keep the first consent time; clear it if consent is withdrawn.
    staff_alerts_consented_at = case
      when not excluded.staff_alerts_consent then null
      else coalesce(public.church_team_settings.staff_alerts_consented_at, now())
    end;

  perform public.onboarding_mark_saved(v_church, 5);
end;
$$;

revoke execute on function public.save_onboarding_team(jsonb, text[], text, text, boolean, text, boolean) from public, anon;
grant execute on function public.save_onboarding_team(jsonb, text[], text, text, boolean, text, boolean) to authenticated;
