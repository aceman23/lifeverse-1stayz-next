-- Onboarding step 3 (What You Need): what the church wants 1Stayz to handle in the pilot.
--
-- Run after 20261008120100_onboarding_step2_site.sql.

create table public.church_needs (
  church_id   uuid primary key references public.churches (id) on delete cascade,
  -- Labels from AVAILABLE_NEEDS in src/lib/onboarding/constants.ts.
  needs       text[] not null default '{}',
  other_need  text check (length(other_need) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger church_needs_set_updated_at
  before update on public.church_needs
  for each row execute function public.set_updated_at();

alter table public.church_needs enable row level security;

create policy "church_needs: members can read"
  on public.church_needs for select to authenticated
  using (public.is_church_member(church_id));

create policy "church_needs: members can insert"
  on public.church_needs for insert to authenticated
  with check (public.is_church_member(church_id));

create policy "church_needs: members can update"
  on public.church_needs for update to authenticated
  using (public.is_church_member(church_id))
  with check (public.is_church_member(church_id));

revoke all on public.church_needs from anon;

-- Step 3 save
create or replace function public.save_onboarding_needs(p_needs text[], p_other_need text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_church uuid := public.onboarding_church_id();
begin
  insert into public.church_needs (church_id, needs, other_need)
  values (v_church, coalesce(p_needs, '{}'), nullif(btrim(p_other_need), ''))
  on conflict (church_id) do update set
    needs      = excluded.needs,
    other_need = excluded.other_need;

  perform public.onboarding_mark_saved(v_church, 2);
end;
$$;

revoke execute on function public.save_onboarding_needs(text[], text) from public, anon;
grant execute on function public.save_onboarding_needs(text[], text) to authenticated;
