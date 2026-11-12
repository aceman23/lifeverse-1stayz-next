-- Settings page: two church profile fields the onboarding wizard doesn't ask for, a save
-- function for editing the first message after setup, and a database rule that Live mode
-- needs the pastor's approvals.
--
-- Run after 20261026000000_pilot_signup_hook.sql.

-- ---------------------------------------------------------------------------
-- Church profile: denomination and attendance
-- ---------------------------------------------------------------------------
-- Both optional. They feed the coarse aggregate dimensions in the AI architecture guidelines
-- (section 7.3: denomination_family, church_size_band); nothing finer is ever derived from them.
-- Saved by the Settings page with a plain UPDATE: the existing "churches: members can update"
-- policy already limits that to members of the church.
alter table public.churches
  add column denomination        text check (length(denomination) <= 100),
  add column average_attendance  int  check (average_attendance between 0 and 100000);

-- ---------------------------------------------------------------------------
-- Settings > First Message
-- ---------------------------------------------------------------------------
-- Replaces the wording of the church's selected first-message template.
--
-- The pastor approves the exact wording guests receive, so changing approved wording sends it
-- back to draft and clears the approval. Saving unchanged wording keeps the approval. A church
-- in Live mode goes back to Shadow, so nothing unapproved is sent without a person reviewing it.
-- Returns the first message's status after the save. SECURITY INVOKER: RLS still applies.
create or replace function public.save_settings_first_message(p_body text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_body      text := btrim(coalesce(p_body, ''));
  v_church    uuid;
  v_template  text;
  v_status    text;
  v_old       text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to save the first message.' using errcode = '28000';
  end if;

  if v_body = '' then
    raise exception 'The first message can''t be empty.' using errcode = '22023';
  end if;
  if length(v_body) > 2000 then
    raise exception 'The first message must be 2,000 characters or fewer.' using errcode = '22023';
  end if;
  -- Same rule as onboarding step 7: every first text tells the guest how to opt out.
  if position('Reply STOP to opt out' in v_body) = 0 then
    raise exception 'The first message must include "Reply STOP to opt out".' using errcode = '22023';
  end if;

  select m.church_id into v_church
  from public.church_members m
  where m.user_id = auth.uid()
  order by m.is_owner desc, m.created_at
  limit 1;

  if v_church is null then
    raise exception 'No church found for this account.' using errcode = 'P0002';
  end if;

  select f.selected_template, f.status into v_template, v_status
  from public.church_first_message f
  where f.church_id = v_church
  for update;

  if v_template is null then
    raise exception 'Finish the First Message step in setup first.' using errcode = 'P0002';
  end if;

  select t.body into v_old
  from public.church_message_templates t
  where t.church_id = v_church and t.client_id = v_template;

  if v_old is null then
    raise exception 'The selected first message template is missing. Choose one again in setup.' using errcode = 'P0002';
  end if;

  if v_old = v_body then
    return v_status;
  end if;

  update public.church_message_templates
  set body = v_body
  where church_id = v_church and client_id = v_template;

  update public.church_first_message
  set status = 'draft', approved_by = null, approved_at = null
  where church_id = v_church;

  update public.onboarding_progress
  set mode = 'shadow'
  where church_id = v_church and mode = 'live';

  return 'draft';
end;
$$;

revoke execute on function public.save_settings_first_message(text) from public, anon;
grant execute on function public.save_settings_first_message(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Live mode needs the pastor's approvals
-- ---------------------------------------------------------------------------
-- Live sends routine messages without review, so a church can switch to it only while its
-- guardrails and first message are both approved. Onboarding step 8 already enforces this in
-- the app; this makes it hold for every write, including the Settings page and the header.
create or replace function public.enforce_live_mode_approvals()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.mode = 'live' and (tg_op = 'INSERT' or old.mode is distinct from 'live') then
    if not exists (
      select 1 from public.church_guardrails g
      where g.church_id = new.church_id and g.approved_at is not null
    ) then
      raise exception 'Live mode needs the guardrails approved by your pastor first.' using errcode = '23514';
    end if;

    if not exists (
      select 1 from public.church_first_message f
      where f.church_id = new.church_id and f.status = 'approved'
    ) then
      raise exception 'Live mode needs the first message approved by your pastor first.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_live_mode_approvals() from public, anon, authenticated;

create trigger onboarding_progress_enforce_live_mode
  before insert or update of mode on public.onboarding_progress
  for each row execute function public.enforce_live_mode_approvals();
