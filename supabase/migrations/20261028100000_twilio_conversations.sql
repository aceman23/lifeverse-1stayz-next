-- WP-3: Twilio Conversations (UI-03, UI-04).
--
-- One Twilio conversation per thread (a visit), with the guest as its SMS participant on the
-- church's guest number. Twilio delivers a guest's text to the conversation that holds that
-- (guest number, church number) pair, and posts it to /api/twilio/conversations, which records
-- it here on that conversation's thread. There's no separate raw incoming-SMS webhook.
--
--   church_sms_numbers          the church's guest number(s): the church side of every SMS
--   twilio_conversation_target  what the server needs to open a thread's conversation
--   twilio_link_conversation    stores the conversation and the guest participant on the thread
--   twilio_inbound_message      records a guest's message on its thread (idempotent)
--
-- The functions are for the server (service role) only. They return ids, never guest details.

-- ---------------------------------------------------------------------------
-- church_sms_numbers
-- ---------------------------------------------------------------------------
-- Separate from the marketing number and its 10DLC campaign. A number belongs to one church,
-- so the number a guest texts identifies the church. Added by the team (README "Twilio").
create table public.church_sms_numbers (
  id                uuid primary key default gen_random_uuid(),
  church_id         uuid not null references public.churches (id) on delete cascade,
  -- US numbers only for the pilot, in E.164 (+1XXXXXXXXXX).
  phone_e164        text not null unique check (phone_e164 ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  twilio_phone_sid  text unique check (twilio_phone_sid ~ '^PN[0-9a-fA-F]{32}$'),
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (church_id, id)
);

-- One active guest number per church for now.
create unique index church_sms_numbers_one_active on public.church_sms_numbers (church_id) where active;

revoke all on public.church_sms_numbers from anon, authenticated;
grant select on public.church_sms_numbers to authenticated;
create policy "church_sms_numbers: members can read" on public.church_sms_numbers
  for select to authenticated using (public.is_church_member(church_id));

-- (970) 638-8984 / 9706388984 / 19706388984 -> +19706388984; anything else -> null.
create or replace function public.us_phone_e164(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^[2-9][0-9]{2}[2-9][0-9]{6}$' then '+1' || d
    when d ~ '^1[2-9][0-9]{2}[2-9][0-9]{6}$' then '+' || d
  end
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) s;
$$;

-- ---------------------------------------------------------------------------
-- twilio_conversation_target
-- ---------------------------------------------------------------------------
-- Everything needed to open (or find) a thread's conversation:
--   { ok: true, church_id, thread_id, conversation_sid, guest_phone, church_number }
-- or { ok: false, reason } when the thread can't have one:
--   not_found | not_sms | thread_closed | no_church_number | no_guest_phone
-- guest_phone is C1; the caller passes it to Twilio and never logs it.
create or replace function public.twilio_conversation_target(p_thread_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_thread  public.church_threads%rowtype;
  v_phone   text;
  v_number  text;
begin
  select * into v_thread from public.church_threads where id = p_thread_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_thread.channel <> 'sms' then
    return jsonb_build_object('ok', false, 'reason', 'not_sms');
  end if;
  if v_thread.status <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'thread_closed');
  end if;

  select n.phone_e164 into v_number
  from public.church_sms_numbers n
  where n.church_id = v_thread.church_id and n.active;
  if v_number is null then
    return jsonb_build_object('ok', false, 'reason', 'no_church_number');
  end if;

  select public.us_phone_e164(p.phone) into v_phone
  from public.church_people p
  where p.church_id = v_thread.church_id and p.id = v_thread.person_id;
  if v_phone is null then
    return jsonb_build_object('ok', false, 'reason', 'no_guest_phone');
  end if;

  return jsonb_build_object(
    'ok', true,
    'church_id', v_thread.church_id,
    'thread_id', v_thread.id,
    'conversation_sid', v_thread.twilio_conversation_sid,
    'guest_phone', v_phone,
    'church_number', v_number);
end;
$$;

-- ---------------------------------------------------------------------------
-- twilio_link_conversation
-- ---------------------------------------------------------------------------
-- Stores a thread's conversation and its guest participant. Safe to repeat. The guest's
-- participants on older threads with the same church number stop routing (Twilio allows one
-- active conversation per number pair, so the caller closed those conversations first).
create or replace function public.twilio_link_conversation(
  p_thread_id        uuid,
  p_conversation_sid text,
  p_participant_sid  text,
  p_guest_phone      text,
  p_church_number    text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread  public.church_threads%rowtype;
begin
  select * into v_thread from public.church_threads where id = p_thread_id for update;
  if not found then
    raise exception 'twilio_link_conversation: thread not found' using errcode = 'P0002';
  end if;
  if v_thread.twilio_conversation_sid is not null and v_thread.twilio_conversation_sid <> p_conversation_sid then
    raise exception 'twilio_link_conversation: thread already has another conversation' using errcode = '23505';
  end if;
  if not exists (select 1 from public.church_sms_numbers n
                 where n.church_id = v_thread.church_id and n.phone_e164 = p_church_number and n.active) then
    raise exception 'twilio_link_conversation: number is not this church''s guest number' using errcode = '22023';
  end if;

  update public.church_threads
  set twilio_conversation_sid = p_conversation_sid
  where id = p_thread_id and twilio_conversation_sid is null;

  -- Older threads for this guest and number no longer receive texts.
  update public.church_thread_participants
  set active = false, left_at = now()
  where kind = 'guest' and active and channel = 'sms'
    and church_address = p_church_number and address = p_guest_phone
    and thread_id <> p_thread_id;

  insert into public.church_thread_participants
    (church_id, thread_id, kind, channel, address, church_address, twilio_participant_sid)
  values (v_thread.church_id, p_thread_id, 'guest', 'sms', p_guest_phone, p_church_number, p_participant_sid)
  on conflict (church_id, thread_id, channel, address) where kind = 'guest' and active
  do update set twilio_participant_sid = excluded.twilio_participant_sid,
                church_address = excluded.church_address;

  if v_thread.twilio_conversation_sid is null then
    insert into public.church_audit_log (church_id, thread_id, actor_type, action, details)
    values (v_thread.church_id, p_thread_id, 'system', 'twilio.conversation_linked',
            jsonb_build_object('conversation_sid', p_conversation_sid, 'participant_sid', p_participant_sid));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- twilio_inbound_message
-- ---------------------------------------------------------------------------
-- Records a guest's message from a Conversations onMessageAdded webhook on the thread that owns
-- the conversation. Twilio retries webhooks, so the message SID makes it idempotent.
--   p_event: { conversation_sid, message_sid, participant_sid, author, body, date_created, media_count }
-- Returns { status: received | duplicate | unrouted, church_id?, thread_id?, message_id? }.
create or replace function public.twilio_inbound_message(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread       public.church_threads%rowtype;
  v_participant  uuid;
  v_message_id   uuid;
  v_at           timestamptz;
  v_sid          text := p_event->>'message_sid';
begin
  if v_sid is null or v_sid !~ '^IM[0-9a-fA-F]{32}$' then
    raise exception 'twilio_inbound_message: message_sid is missing or invalid' using errcode = '22023';
  end if;

  select * into v_thread from public.church_threads
  where twilio_conversation_sid = p_event->>'conversation_sid';
  if not found then
    return jsonb_build_object('status', 'unrouted');
  end if;

  select p.id into v_participant
  from public.church_thread_participants p
  where p.church_id = v_thread.church_id and p.thread_id = v_thread.id and p.kind = 'guest'
    and (p.twilio_participant_sid = p_event->>'participant_sid'
         or (p.channel = 'sms' and p.address = public.us_phone_e164(p_event->>'author')))
  order by p.active desc, p.joined_at desc
  limit 1;

  begin
    v_at := (p_event->>'date_created')::timestamptz;
  exception when others then
    v_at := null; -- recorded with received_at and flagged clock_skew by the insert trigger
  end;

  insert into public.church_messages
    (church_id, thread_id, participant_id, event_type, direction, sender, channel, body,
     status, provider_message_id, event_at, source, source_event_id)
  values
    (v_thread.church_id, v_thread.id, v_participant, 'message', 'inbound', 'guest', 'sms',
     left(coalesce(p_event->>'body', ''), 10000), 'received', v_sid, v_at, 'twilio', v_sid)
  on conflict (church_id, source, source_event_id) do nothing
  returning id into v_message_id;

  if v_message_id is null then
    select m.id into v_message_id from public.church_messages m
    where m.church_id = v_thread.church_id and m.source = 'twilio' and m.source_event_id = v_sid;
    return jsonb_build_object('status', 'duplicate', 'church_id', v_thread.church_id,
                              'thread_id', v_thread.id, 'message_id', v_message_id);
  end if;

  insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, action, details)
  values (v_thread.church_id, v_thread.id, v_message_id, 'webhook', 'message.received',
          jsonb_build_object('provider', 'twilio', 'message_sid', v_sid,
                             'media_count', coalesce((p_event->>'media_count')::int, 0),
                             'thread_status', v_thread.status));

  return jsonb_build_object('status', 'received', 'church_id', v_thread.church_id,
                            'thread_id', v_thread.id, 'message_id', v_message_id);
end;
$$;

revoke execute on function public.twilio_conversation_target(uuid) from public, anon, authenticated;
revoke execute on function public.twilio_link_conversation(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.twilio_inbound_message(jsonb) from public, anon, authenticated;
grant execute on function public.twilio_conversation_target(uuid) to service_role;
grant execute on function public.twilio_link_conversation(uuid, text, text, text, text) to service_role;
grant execute on function public.twilio_inbound_message(jsonb) to service_role;
