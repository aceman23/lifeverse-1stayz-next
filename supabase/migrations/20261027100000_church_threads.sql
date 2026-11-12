-- WP-1: conversation threads, participants, messages and the audit log (schema v1: thread,
-- participant, message, audit; pilot plan P2 / DB-01, DB-04).
--
-- Run after 20261026130000_church_people.sql.
--
-- The thread is ours; Twilio and email are pipes (pilot plan 1.3):
--   church_people -> church_visits -> church_threads (one per visit)
--     -> church_thread_participants (the guest's SMS number and/or email, staff, the assistant)
--     -> church_messages (every turn and thread event, in order)
-- church_audit_log records what the system did and why (sends, blocks, model calls).
--
-- Every row has church_id; child rows reference their parent together with church_id, so
-- nothing can point across churches. RLS lets staff (church_members) read their own church.
--
-- Who writes: only the server. Intake, the Twilio and email webhooks, the scheduler and the
-- agent run server-side with the service role (Supabase's server key, never in the browser).
-- Signed-in staff get read access here; staff replies and approvals arrive in WP-6 through
-- dedicated functions. The send guard below holds for every writer, service role included.

-- church_visits gets a key that includes the person, so a thread's visit must belong to the
-- thread's person.
alter table public.church_visits
  add constraint church_visits_church_person_id_key unique (church_id, person_id, id);

-- ---------------------------------------------------------------------------
-- church_threads: one per visit
-- ---------------------------------------------------------------------------
create table public.church_threads (
  id                       uuid primary key default gen_random_uuid(),
  church_id                uuid not null references public.churches (id) on delete cascade,
  person_id                uuid not null,
  visit_id                 uuid not null,
  -- The channel first contact goes out on. Replies on either channel join the same thread.
  channel                  text not null check (channel in ('sms', 'email')),
  status                   text not null default 'open' check (status in ('open', 'closed', 'opted_out')),
  -- Agent-quiet state (guidelines 4.8.2): the assistant may only send while it handles the thread.
  handled_by               text not null default 'assistant' check (handled_by in ('assistant', 'staff')),
  escalated_at             timestamptz,
  -- A category only (e.g. 'care', 'crisis', 'theology'); never the guest's words.
  escalation_reason        text check (length(escalation_reason) <= 60),
  twilio_conversation_sid  text unique check (twilio_conversation_sid ~ '^CH[0-9a-fA-F]{32}$'),
  -- Root Message-ID of the email conversation, for reply matching.
  email_thread_key         text check (length(email_thread_key) <= 998),
  -- Scheduled end of the service the guest attended, in UTC (from church_services in the
  -- church's timezone). First contact is due 30 minutes later (SOW S2), whatever time the
  -- guest submitted the form.
  service_end_at           timestamptz not null,
  -- Always service_end_at + 30 minutes: set by a trigger, which overwrites any other value.
  first_contact_due_at     timestamptz not null,
  first_contact_sent_at    timestamptz,
  -- Bumped by every message or event. A draft records the version it was built from; any
  -- newer event makes it stale (guidelines 4.8.2).
  version                  bigint not null default 0,
  last_event_at            timestamptz,
  closed_at                timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (church_id, id),
  unique (church_id, visit_id),
  unique (church_id, email_thread_key),
  foreign key (church_id, person_id, visit_id)
    references public.church_visits (church_id, person_id, id) on delete cascade,
  check ((status = 'open') = (closed_at is null)),
  check ((escalated_at is null) = (escalation_reason is null))
);

comment on table public.church_threads is 'One conversation per visit, across SMS and email. Written by the server only.';

-- The scheduler's queue: open threads still waiting for first contact.
create index church_threads_first_contact_idx on public.church_threads (first_contact_due_at)
  where status = 'open' and first_contact_sent_at is null;
create index church_threads_church_person_idx on public.church_threads (church_id, person_id);
create index church_threads_church_last_event_idx on public.church_threads (church_id, last_event_at desc nulls last);

create trigger church_threads_set_updated_at
  before update on public.church_threads
  for each row execute function public.set_updated_at();

-- First contact is due 30 minutes after the service ends (SOW S2). Computed here so no
-- writer can set a different deadline; quiet hours may delay a send, never the deadline.
create or replace function public.church_threads_first_contact_due()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.first_contact_due_at := new.service_end_at + interval '30 minutes';
  return new;
end;
$$;

revoke execute on function public.church_threads_first_contact_due() from public, anon, authenticated;

create trigger church_threads_first_contact_due
  before insert or update on public.church_threads
  for each row execute function public.church_threads_first_contact_due();

-- ---------------------------------------------------------------------------
-- church_thread_participants
-- ---------------------------------------------------------------------------
create table public.church_thread_participants (
  id                       uuid primary key default gen_random_uuid(),
  church_id                uuid not null,
  thread_id                uuid not null,
  kind                     text not null check (kind in ('guest', 'staff', 'assistant')),
  channel                  text not null check (channel in ('sms', 'email', 'app')),
  -- The guest's phone (E.164) or email. Null for staff and the assistant in the app.
  address                  text check (length(address) <= 320),
  -- The church side of the pipe: the church's guest number (E.164) or mailbox. Inbound
  -- messages are routed by (channel, church_address, address) to the open thread.
  church_address           text check (length(church_address) <= 320),
  -- Staff member (kind 'staff').
  user_id                  uuid references auth.users (id) on delete set null,
  twilio_participant_sid   text unique check (twilio_participant_sid ~ '^MB[0-9a-fA-F]{32}$'),
  active                   boolean not null default true,
  joined_at                timestamptz not null default now(),
  left_at                  timestamptz,
  unique (church_id, id),
  unique (church_id, thread_id, id),
  foreign key (church_id, thread_id) references public.church_threads (church_id, id) on delete cascade,
  check (kind <> 'guest' or (address is not null and church_address is not null and channel in ('sms', 'email'))),
  check (active = (left_at is null))
);

-- One active guest participant per thread and channel/address.
create unique index church_thread_participants_guest_key
  on public.church_thread_participants (church_id, thread_id, channel, address)
  where kind = 'guest' and active;
-- Inbound routing: which open conversation does (church number, guest number) belong to?
create index church_thread_participants_route_idx
  on public.church_thread_participants (channel, church_address, address)
  where kind = 'guest' and active;

-- ---------------------------------------------------------------------------
-- church_messages: every turn and thread event, ordered (guidelines 4.8.1)
-- ---------------------------------------------------------------------------
create table public.church_messages (
  id                    uuid primary key default gen_random_uuid(),
  church_id             uuid not null,
  thread_id             uuid not null,
  participant_id        uuid,
  -- 'message' for a turn; the rest are thread events that matter for ordering and safety.
  event_type            text not null default 'message'
                          check (event_type in ('message', 'opt_out', 'opt_in', 'help', 'escalation', 'takeover', 'release', 'override')),
  direction             text not null check (direction in ('inbound', 'outbound', 'internal')),
  sender                text not null check (sender in ('guest', 'assistant', 'staff', 'system')),
  -- Staff member who wrote, approved or overrode it.
  sender_user_id        uuid references auth.users (id) on delete set null,
  channel               text not null check (channel in ('sms', 'email', 'app')),
  -- Guest text can hold identifiers (C1) and care or prayer content (C3). Never logged,
  -- never embedded, never in the pattern corpus.
  body                  text check (length(body) <= 10000),
  -- Data class from the tagger (WP-7a). Until tagged, a message is treated as C3: the
  -- strictest class, as the guidelines require when unsure.
  data_class            text not null default 'C3' check (data_class in ('C1', 'C2', 'C3', 'C4', 'C5', 'C6')),
  -- Outbound: draft (assistant, not yet reviewed) -> held (waiting for staff in Shadow mode)
  -- -> approved -> sent -> delivered, or failed / discarded (stale or rejected).
  -- Inbound: received. Internal events (escalation, takeover, release, override): logged.
  status                text not null
                          check (status in ('draft', 'held', 'approved', 'sent', 'delivered', 'failed', 'discarded', 'received', 'logged')),
  -- For drafts: the thread version the draft was built from (send-time freshness check).
  built_from_version    bigint,
  approved_by           uuid references auth.users (id) on delete set null,
  approved_at           timestamptz,
  sent_at               timestamptz,
  -- Machine-readable reason only (e.g. 'twilio_30007', 'stale_draft'); never message text.
  failure_reason        text check (length(failure_reason) <= 200),
  -- Provider ids: Twilio message SID, or the email provider's id.
  provider_message_id   text check (length(provider_message_id) <= 200),
  email_message_id      text check (length(email_message_id) <= 998),
  in_reply_to           text check (length(in_reply_to) <= 998),
  -- Ordering (guidelines 4.8.1): when it happened per its source, when we received it,
  -- who reported it, and the source's own id (a retried webhook is rejected, not duplicated).
  event_at              timestamptz not null,
  received_at           timestamptz not null default now(),
  source                text not null check (source in ('app', 'twilio', 'email', 'subsplash', 'model')),
  source_event_id       text check (length(source_event_id) <= 200),
  -- event_at was missing or more than 5 minutes from received_at; ordering uses received_at.
  clock_skew            boolean not null default false,
  -- Per-thread sequence, assigned on insert (stable tie-break).
  seq                   bigint not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (church_id, id),
  unique (church_id, source, source_event_id),
  unique (church_id, thread_id, seq),
  foreign key (church_id, thread_id) references public.church_threads (church_id, id) on delete cascade,
  foreign key (church_id, thread_id, participant_id)
    references public.church_thread_participants (church_id, thread_id, id) on delete set null (participant_id),
  check (event_type <> 'message' or body is not null),
  check ((direction = 'inbound') = (status = 'received')),
  check ((direction = 'internal') = (status = 'logged')),
  check (status not in ('sent', 'delivered') or sent_at is not null),
  check (status <> 'draft' or sender = 'assistant')
);

comment on table public.church_messages is 'Every turn and thread event, ordered by event_at, trust, seq. Written by the server only.';

create index church_messages_thread_order_idx on public.church_messages (church_id, thread_id, event_at, seq);
create index church_messages_outbox_idx on public.church_messages (church_id, status) where status in ('held', 'approved');
create index church_messages_email_id_idx on public.church_messages (church_id, email_message_id) where email_message_id is not null;

create trigger church_messages_set_updated_at
  before update on public.church_messages
  for each row execute function public.set_updated_at();

-- Assigns seq, flags clock skew, and bumps the thread's version. Locking the thread row
-- serializes concurrent inserts per thread, so seq and version never collide.
create or replace function public.church_messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version bigint;
begin
  if new.event_at is null or abs(extract(epoch from (new.event_at - new.received_at))) > 300 then
    new.clock_skew := true;
    new.event_at := coalesce(new.event_at, new.received_at);
  end if;

  update public.church_threads t
  set version = t.version + 1,
      last_event_at = greatest(coalesce(t.last_event_at, new.event_at), new.event_at)
  where t.church_id = new.church_id and t.id = new.thread_id
  returning t.version into v_version;

  if v_version is null then
    raise exception 'church_messages: thread % not found in church %', new.thread_id, new.church_id
      using errcode = '23503';
  end if;

  new.seq := v_version;
  return new;
end;
$$;

revoke execute on function public.church_messages_before_insert() from public, anon, authenticated;

create trigger church_messages_before_insert
  before insert on public.church_messages
  for each row execute function public.church_messages_before_insert();

-- Send guard (guidelines 4.8.2, fail closed). An outbound message can't become approved or
-- sent unless the thread is open, the guest may be contacted and isn't awaiting identity
-- review, and (for the assistant) the thread hasn't been handed to staff. This is the
-- database's backstop; the sender also checks the provider's live opt-out state, draft
-- freshness and quiet hours right before sending (WP-4).
create or replace function public.church_messages_send_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread  public.church_threads%rowtype;
  v_person  public.church_people%rowtype;
begin
  if new.direction <> 'outbound' or new.status not in ('approved', 'sent') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status in ('approved', 'sent', 'delivered') and new.status = old.status then
    return new;
  end if;

  select * into v_thread from public.church_threads where church_id = new.church_id and id = new.thread_id;
  select * into v_person from public.church_people where church_id = new.church_id and id = v_thread.person_id;

  if v_thread.status <> 'open' then
    raise exception 'blocked_send: thread is %', v_thread.status using errcode = '23514';
  end if;
  if v_person.do_not_contact then
    raise exception 'blocked_send: guest is marked do not contact' using errcode = '23514';
  end if;
  if v_person.needs_review then
    raise exception 'blocked_send: guest identity needs review' using errcode = '23514';
  end if;
  if new.sender = 'assistant' and v_thread.handled_by <> 'assistant' then
    raise exception 'blocked_send: thread is handled by staff' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.church_messages_send_guard() from public, anon, authenticated;

create trigger church_messages_send_guard
  before insert or update of status on public.church_messages
  for each row execute function public.church_messages_send_guard();

-- ---------------------------------------------------------------------------
-- church_audit_log: append-only (DB-04)
-- ---------------------------------------------------------------------------
-- What the system did and why: messages sent, sends blocked (with reason), model calls
-- (model, guardrail version, Tier-2 decision, tokens, latency), mode changes. No foreign
-- key on church_id or the thread/message ids, so the trail outlives deleted rows.
-- details holds ids and column names only, never C1 or C3 values (guidelines 4.4, 4.5).
create table public.church_audit_log (
  id                 bigint generated always as identity primary key,
  church_id          uuid not null,
  thread_id          uuid,
  message_id         uuid,
  actor_type         text not null check (actor_type in ('staff', 'system', 'model', 'webhook', 'scheduler')),
  actor_user_id      uuid,
  -- e.g. 'message.sent', 'message.blocked', 'message.approved', 'model.call', 'thread.escalated'.
  action             text not null check (action ~ '^[a-z_]+\.[a-z_]+$' and length(action) <= 60),
  -- For blocked sends: 'opted_out', 'stale_draft', 'staff_owned', 'needs_review', 'quiet_hours', ...
  reason             text check (length(reason) <= 60),
  model              text check (length(model) <= 100),
  guardrail_version  int,
  tier2_decision     text check (tier2_decision in ('pass', 'escalate', 'block')),
  tokens_in          int check (tokens_in >= 0),
  tokens_out         int check (tokens_out >= 0),
  latency_ms         int check (latency_ms >= 0),
  details            jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create index church_audit_log_church_created_idx on public.church_audit_log (church_id, created_at desc);
create index church_audit_log_thread_idx on public.church_audit_log (church_id, thread_id) where thread_id is not null;

create or replace function public.church_audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'church_audit_log is append-only' using errcode = '42501';
end;
$$;

revoke execute on function public.church_audit_log_append_only() from public, anon, authenticated;

create trigger church_audit_log_append_only
  before update or delete on public.church_audit_log
  for each row execute function public.church_audit_log_append_only();

-- ---------------------------------------------------------------------------
-- Privileges and row level security
-- ---------------------------------------------------------------------------
-- RLS is enabled and forced by the enforce_rls_on_new_tables event trigger. The API roles
-- start with nothing; signed-in staff get read access to their own church only. The server
-- (service_role) writes, and bypasses RLS but not the triggers above.
revoke all on public.church_threads, public.church_thread_participants, public.church_messages,
  public.church_audit_log from anon, authenticated;
revoke update, delete, truncate on public.church_audit_log from service_role;

grant select on public.church_threads, public.church_thread_participants, public.church_messages,
  public.church_audit_log to authenticated;

create policy "church_threads: members can read" on public.church_threads
  for select to authenticated using (public.is_church_member(church_id));
create policy "church_thread_participants: members can read" on public.church_thread_participants
  for select to authenticated using (public.is_church_member(church_id));
create policy "church_messages: members can read" on public.church_messages
  for select to authenticated using (public.is_church_member(church_id));
create policy "church_audit_log: members can read" on public.church_audit_log
  for select to authenticated using (public.is_church_member(church_id));
