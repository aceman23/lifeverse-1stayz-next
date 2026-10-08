-- Onboarding step 8 (Ready Check): the launch mode and completion. The checklist itself is
-- worked out by the app from the earlier steps, so it isn't stored.
--
-- Run after 20261008120600_onboarding_step7_first_message.sql.

-- shadow: 1Stayz drafts every message and holds it for approval. live: sends automatically.
alter table public.onboarding_progress
  add column mode text check (mode in ('shadow', 'live'));

create or replace function public.finish_onboarding(p_mode text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_church uuid := public.onboarding_church_id();
begin
  if p_mode is null or p_mode not in ('shadow', 'live') then
    raise exception 'Mode must be shadow or live.' using errcode = '22023';
  end if;

  update public.onboarding_progress set
    mode            = p_mode,
    completed       = true,
    completed_at    = coalesce(completed_at, now()),
    current_step    = 7,
    last_saved_step = 7
  where church_id = v_church;
end;
$$;

revoke execute on function public.finish_onboarding(text) from public, anon;
grant execute on function public.finish_onboarding(text) to authenticated;
