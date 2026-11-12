-- WP-8: go-live hardening (DB-07, DB-09, DB-10, UI-09).
--
--   Notifications   church_notifications is an outbox. Rows are queued by the database the moment
--                   something needs a person, and sent by the app (src/lib/messaging/notifier.ts)
--                   from the cron every minute and right after an escalation:
--                     escalation           a thread needs a pastor (assistant or staff flagged it):
--                                          email to the church's escalation contacts, and a text to
--                                          the team alerts phone if the church turned that on.
--                     escalation_reminder  still unanswered after 15 minutes: everyone again, plus
--                                          the 1Stayz on-call (ops).
--                     alert                a failed send, a late first contact, the AI budget:
--                                          the 1Stayz on-call (ops) within 5 minutes (P13).
--                   Payloads hold a first name, a category and ids only: never what the guest wrote.
--   AI budget       church_ai_tokens_today(): tokens used today (church time) from the model-call
--                   audit rows; the app stops AI calls for that church above its budget.
--   Heartbeats      ops_heartbeats: the cron records each run; /api/health reports a stale cron
--                   to the uptime monitor.

-- ---------------------------------------------------------------------------
-- New alert kind: the church's daily AI budget is used up
-- ---------------------------------------------------------------------------
alter table public.church_alerts drop constraint church_alerts_kind_check;
alter table public.church_alerts add constraint church_alerts_kind_check
  check (kind in ('first_contact_late', 'send_failed', 'ai_budget_reached'));

-- ---------------------------------------------------------------------------
-- Notifications outbox
-- ---------------------------------------------------------------------------
create table public.church_notifications (
  id             uuid primary key default gen_random_uuid(),
  church_id      uuid not null references public.churches (id) on delete cascade,
  thread_id      uuid,
  alert_id       uuid,
  kind           text not null check (kind in ('escalation', 'escalation_reminder', 'alert')),
  -- staff: the church's own team. ops: the 1Stayz on-call (address from OPS_ALERT_EMAIL).
  audience       text not null check (audience in ('staff', 'ops')),
  channel        text not null check (channel in ('email', 'sms')),
  -- Null for ops (the app knows the address).
  to_address     text check (length(to_address) <= 320),
  recipient_name text check (length(recipient_name) <= 200),
  -- What the message says: first name, reason category, alert kind, ids. Never guest words.
  payload        jsonb not null default '{}'::jsonb,
  dedupe_key     text not null check (length(dedupe_key) <= 400),
  status         text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  attempts       int not null default 0 check (attempts >= 0),
  last_error     text check (length(last_error) <= 200),
  lease_until    timestamptz,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  unique (church_id, dedupe_key),
  check (audience = 'ops' or to_address is not null)
);

comment on table public.church_notifications is 'Staff and on-call notifications (outbox). Written by the database and the server only.';

create index church_notifications_queue_idx on public.church_notifications (created_at) where status = 'queued';
create index church_notifications_thread_idx on public.church_notifications (church_id, thread_id) where thread_id is not null;

revoke all on public.church_notifications from anon, authenticated;
grant select on public.church_notifications to authenticated;
create policy "church_notifications: members can read" on public.church_notifications
  for select to authenticated using (public.is_church_member(church_id));

-- Who hears about a guest who needs a pastor: escalation contacts by email (in escalation order),
-- the team alerts phone by text if turned on with consent, and the church owner's account email if
-- nobody else is set up. p_kind: 'escalation' or 'escalation_reminder' (which also tells ops).
create or replace function public.queue_escalation_notifications(p_thread uuid, p_kind text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  t        public.church_threads%rowtype;
  v_first  text;
  v_key    text;
  v_payload jsonb;
  v_n      int := 0;
  r        record;
begin
  select * into t from public.church_threads where id = p_thread;
  if not found or t.escalated_at is null then
    return 0;
  end if;
  select p.first_name into v_first from public.church_people p where p.church_id = t.church_id and p.id = t.person_id;
  v_key := p_kind || ':' || t.id || ':' || extract(epoch from t.escalated_at)::bigint;
  v_payload := jsonb_build_object('first_name', v_first, 'reason', t.escalation_reason,
                                  'escalated_at', t.escalated_at, 'flagged_by', case when t.escalated_by is null then 'assistant' else 'staff' end);

  for r in
    select s.email as address, s.name
    from public.church_staff s
    where s.church_id = t.church_id and s.receives_escalations and s.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    order by s.escalation_rank nulls last, s.position
  loop
    insert into public.church_notifications (church_id, thread_id, kind, audience, channel, to_address, recipient_name, payload, dedupe_key)
    values (t.church_id, t.id, p_kind, 'staff', 'email', lower(r.address), r.name, v_payload, v_key || ':email:' || lower(r.address))
    on conflict (church_id, dedupe_key) do nothing;
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    -- Nobody set up for escalations yet: the church owner's account email.
    insert into public.church_notifications (church_id, thread_id, kind, audience, channel, to_address, recipient_name, payload, dedupe_key)
    select t.church_id, t.id, p_kind, 'staff', 'email', lower(u.email), m.full_name, v_payload, v_key || ':email:' || lower(u.email)
    from public.church_members m join auth.users u on u.id = m.user_id
    where m.church_id = t.church_id and m.is_owner and u.email is not null
    on conflict (church_id, dedupe_key) do nothing;
  end if;

  insert into public.church_notifications (church_id, thread_id, kind, audience, channel, to_address, payload, dedupe_key)
  select t.church_id, t.id, p_kind, 'staff', 'sms', ts.staff_alerts_phone, v_payload, v_key || ':sms:' || ts.staff_alerts_phone
  from public.church_team_settings ts
  where ts.church_id = t.church_id and ts.staff_alerts_enabled and ts.staff_alerts_consent
    and coalesce(btrim(ts.staff_alerts_phone), '') <> ''
  on conflict (church_id, dedupe_key) do nothing;

  if p_kind = 'escalation_reminder' then
    insert into public.church_notifications (church_id, thread_id, kind, audience, channel, payload, dedupe_key)
    values (t.church_id, t.id, p_kind, 'ops', 'email', v_payload, v_key || ':ops')
    on conflict (church_id, dedupe_key) do nothing;
  end if;
  return v_n;
end;
$$;

-- Every new escalation (by the assistant or by staff) notifies the team at once.
create or replace function public.church_threads_notify_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.escalated_at is not null and new.escalated_at is distinct from old.escalated_at then
    perform public.queue_escalation_notifications(new.id, 'escalation');
  end if;
  return new;
end;
$$;

create trigger church_threads_notify_escalation
  after update of escalated_at on public.church_threads
  for each row execute function public.church_threads_notify_escalation();

-- Every new alert tells the 1Stayz on-call (P13: failed sends reach the PM within 5 minutes).
create or replace function public.church_alerts_notify_ops()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.church_notifications (church_id, thread_id, alert_id, kind, audience, channel, payload, dedupe_key)
  values (new.church_id, new.thread_id, new.id, 'alert', 'ops', 'email',
          jsonb_build_object('alert_kind', new.kind, 'reason', new.details->>'reason'), 'alert:' || new.id)
  on conflict (church_id, dedupe_key) do nothing;
  return new;
end;
$$;

create trigger church_alerts_notify_ops
  after insert on public.church_alerts
  for each row execute function public.church_alerts_notify_ops();

-- Escalations still waiting for a person after p_after: remind everyone once.
create or replace function public.queue_escalation_reminders(p_now timestamptz default now(), p_after interval default interval '15 minutes')
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r   record;
  v_n int := 0;
begin
  for r in
    select t.id from public.church_threads t
    where t.status = 'open' and t.escalated_at is not null and t.escalation_answered_at is null
      and t.escalated_at <= p_now - p_after
      and not exists (select 1 from public.church_notifications n
                      where n.church_id = t.church_id and n.thread_id = t.id and n.kind = 'escalation_reminder'
                        and n.payload->>'escalated_at' = to_jsonb(t.escalated_at)#>>'{}')
  loop
    perform public.queue_escalation_notifications(r.id, 'escalation_reminder');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- The sender's queue: leased, oldest first.
create or replace function public.claim_notifications(p_limit int default 25, p_lease_seconds int default 120)
returns table (id uuid, church_id uuid, church_name text, thread_id uuid, kind text, audience text, channel text,
               to_address text, recipient_name text, payload jsonb, attempts int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select n.*, c.name as c_name from public.church_notifications n
    join public.churches c on c.id = n.church_id
    where n.status = 'queued' and (n.lease_until is null or n.lease_until < now())
    order by n.created_at
    limit least(greatest(p_limit, 1), 100)
    for update of n skip locked
  loop
    update public.church_notifications
    set lease_until = now() + make_interval(secs => p_lease_seconds), attempts = church_notifications.attempts + 1
    where church_notifications.id = r.id;
    id := r.id; church_id := r.church_id; church_name := r.c_name; thread_id := r.thread_id; kind := r.kind;
    audience := r.audience; channel := r.channel; to_address := r.to_address; recipient_name := r.recipient_name;
    payload := r.payload; attempts := r.attempts + 1;
    return next;
  end loop;
end;
$$;

-- p_status: 'sent', 'failed' (retried up to 3 attempts, then failed for good) or 'skipped'.
create or replace function public.mark_notification(p_id uuid, p_status text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('sent', 'failed', 'skipped') then
    raise exception 'mark_notification: invalid status' using errcode = '22023';
  end if;
  update public.church_notifications
  set status = case when p_status = 'failed' and attempts < 3 then 'queued' else p_status end,
      sent_at = case when p_status = 'sent' then now() else sent_at end,
      last_error = left(p_error, 200),
      lease_until = case when p_status = 'failed' and attempts < 3 then now() + make_interval(mins => attempts) else null end
  where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- AI budget
-- ---------------------------------------------------------------------------
create or replace function public.church_ai_tokens_today(p_church uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(coalesce(a.tokens_in, 0) + coalesce(a.tokens_out, 0)), 0)::bigint
  from public.church_audit_log a
  where a.church_id = p_church and a.action = 'model.call'
    and a.created_at >= (date_trunc('day', now() at time zone (select c.timezone from public.churches c where c.id = p_church))
                         at time zone (select c.timezone from public.churches c where c.id = p_church));
$$;

-- ---------------------------------------------------------------------------
-- Heartbeats (no church data; server only)
-- ---------------------------------------------------------------------------
create table public.ops_heartbeats (
  name     text primary key check (name ~ '^[a-z_]{1,40}$'),
  at       timestamptz not null default now(),
  details  jsonb not null default '{}'::jsonb
);

comment on table public.ops_heartbeats is 'Last run of each background job, for /api/health. Server only.';
revoke all on public.ops_heartbeats from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privileges: the server only
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.church_threads_notify_escalation()',
    'public.church_alerts_notify_ops()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.queue_escalation_notifications(uuid, text)',
    'public.queue_escalation_reminders(timestamptz, interval)',
    'public.claim_notifications(int, int)',
    'public.mark_notification(uuid, text, text)',
    'public.church_ai_tokens_today(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
