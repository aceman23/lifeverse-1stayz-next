-- Only the church owner changes what the pastor approves.
--
-- The guardrails (tone, sign-off, beliefs and practices, escalation topics, reference documents),
-- the first message (wording, choice, status, approval) and their approvals were writable by any
-- church member straight through the API, because those tables have "members can insert /
-- update / delete" policies. So a staff member could approve guardrails or the first message, or
-- change approved wording without clearing the approval, bypassing the owner-only Settings
-- functions (20261105100000) and onboarding (also owner-only).
--
-- This trigger makes every write through the API (role "authenticated") to those tables
-- owner-only. Reads are unchanged, and server jobs (the service role) are unaffected.
-- Settings › First Message editing becomes owner-only too, matching Guardrails.

create or replace function public.enforce_owner_writes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_church uuid := case when tg_op = 'DELETE' then old.church_id else new.church_id end;
begin
  -- Writes through the API run as "authenticated"; the service role and migrations don't.
  if current_user = 'authenticated' and not exists (
    select 1 from public.church_members m
    where m.church_id = v_church and m.user_id = auth.uid() and m.is_owner
  ) then
    raise exception 'Only the church owner can change the guardrails or the first message.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.church_id is distinct from old.church_id then
    raise exception 'A row can''t move to another church.' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.enforce_owner_writes() from public, anon;

do $$
declare
  t text;
begin
  foreach t in array array[
    'church_guardrails', 'church_doctrinal_positions', 'church_escalation_topics', 'church_documents',
    'church_first_message', 'church_message_templates'
  ] loop
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.enforce_owner_writes()',
                   t || '_owner_writes', t);
  end loop;
end $$;
