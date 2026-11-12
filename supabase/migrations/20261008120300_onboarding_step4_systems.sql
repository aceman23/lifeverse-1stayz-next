-- Onboarding step 4 (Connect Systems): how guests arrive from Subsplash, which email account
-- sends, and where the SMS number is in carrier approval. Step 7 also writes
-- consent_wording_live here.
--
-- Run after 20261008120200_onboarding_step3_needs.sql.

create table public.church_integrations (
  church_id                     uuid primary key references public.churches (id) on delete cascade,
  subsplash                     text not null default 'none'
                                  check (subsplash in ('none', 'webhook', 'zapier', 'qrcard')),
  email_provider                text not null default 'none'
                                  check (email_provider in ('none', 'gmail', 'outlook', '1stayz')),
  sms_status                    text not null default 'submitted'
                                  check (sms_status in ('submitted', 'pending', 'approved')),
  -- Until the text number is approved, guests are contacted by email first.
  email_fallback_acknowledged   boolean not null default false,
  consent_wording_live          boolean not null default false,
  shadow_sunday_acknowledged    boolean not null default false,
  shadow_sunday_completed       boolean not null default false,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create trigger church_integrations_set_updated_at
  before update on public.church_integrations
  for each row execute function public.set_updated_at();

alter table public.church_integrations enable row level security;

create policy "church_integrations: members can read"
  on public.church_integrations for select to authenticated
  using (public.is_church_member(church_id));

create policy "church_integrations: members can insert"
  on public.church_integrations for insert to authenticated
  with check (public.is_church_member(church_id));

create policy "church_integrations: members can update"
  on public.church_integrations for update to authenticated
  using (public.is_church_member(church_id))
  with check (public.is_church_member(church_id));

revoke all on public.church_integrations from anon;

-- Step 4 save. consent_wording_live is left alone here; it belongs to step 7.
create or replace function public.save_onboarding_systems(
  p_subsplash                    text,
  p_email_provider               text,
  p_sms_status                   text,
  p_email_fallback_acknowledged  boolean,
  p_shadow_sunday_acknowledged   boolean,
  p_shadow_sunday_completed      boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_church uuid := public.onboarding_church_id();
begin
  insert into public.church_integrations (
    church_id, subsplash, email_provider, sms_status,
    email_fallback_acknowledged, shadow_sunday_acknowledged, shadow_sunday_completed
  )
  values (
    v_church, p_subsplash, p_email_provider, p_sms_status,
    coalesce(p_email_fallback_acknowledged, false),
    coalesce(p_shadow_sunday_acknowledged, false),
    coalesce(p_shadow_sunday_completed, false)
  )
  on conflict (church_id) do update set
    subsplash                   = excluded.subsplash,
    email_provider              = excluded.email_provider,
    sms_status                  = excluded.sms_status,
    email_fallback_acknowledged = excluded.email_fallback_acknowledged,
    shadow_sunday_acknowledged  = excluded.shadow_sunday_acknowledged,
    shadow_sunday_completed     = excluded.shadow_sunday_completed;

  perform public.onboarding_mark_saved(v_church, 3);
end;
$$;

revoke execute on function public.save_onboarding_systems(text, text, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.save_onboarding_systems(text, text, text, boolean, boolean, boolean) to authenticated;
