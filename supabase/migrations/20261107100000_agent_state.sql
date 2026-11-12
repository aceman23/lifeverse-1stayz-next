-- AI-09: the state-update writer. After each guest message the assistant records what the guest
-- told us: "coming back" with a date (the thread shows as Coming back on Today and in the leader
-- list) and short facts on the person (household, life stage, interests).
--
-- Facts are fixed 1Stayz labels ("Mentioned their kids"), never the guest's words, so they are
-- C2. They are append-only, with their source ('guest' = matched by rules on the guest's own
-- message, 'model' = the classifier) and the message they came from; a retry adds nothing.
-- "Coming back" only ever moves later, and never overrides staff marking the guest welcomed.

create or replace function public.agent_record_state(
  p_thread         uuid,
  p_message        uuid,
  p_coming_back_on date,
  p_facts          jsonb
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  t      public.church_threads%rowtype;
  v_n    int := 0;
  v_set  boolean := false;
begin
  select * into t from public.church_threads where id = p_thread for update;
  if not found then
    return 0;
  end if;
  if p_message is not null and not exists (
    select 1 from public.church_messages m where m.id = p_message and m.church_id = t.church_id and m.thread_id = t.id and m.direction = 'inbound'
  ) then
    raise exception 'agent_record_state: message is not a guest message on this thread' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_facts, '[]')) <> 'array' or jsonb_array_length(coalesce(p_facts, '[]')) > 20 then
    raise exception 'agent_record_state: facts must be a short list' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_facts, '[]')) e
             where coalesce(e->>'field', '') not in ('plans', 'household', 'life_stage', 'interest')
                or coalesce(e->>'source', '') not in ('guest', 'model')
                or length(coalesce(e->>'value', '')) not between 1 and 200) then
    raise exception 'agent_record_state: invalid fact' using errcode = '22023';
  end if;

  with ins as (
    insert into public.church_person_facts (church_id, person_id, field, value, data_class, source, source_event_id, event_at, actor)
    select t.church_id, t.person_id, e->>'field', e->>'value', 'C2', e->>'source',
           'state:' || coalesce(p_message::text, t.id::text) || ':' || md5(e->>'value'), now(), null
    from jsonb_array_elements(coalesce(p_facts, '[]')) e
    -- The same fact once per person: "Mentioned their kids" isn't repeated every message.
    where not exists (select 1 from public.church_person_facts f
                      where f.church_id = t.church_id and f.person_id = t.person_id and f.value = e->>'value')
    on conflict (church_id, source, source_event_id) do nothing
    returning 1)
  select count(*) into v_n from ins;

  if p_coming_back_on is not null and t.status = 'open'
     and p_coming_back_on >= (now() at time zone (select c.timezone from public.churches c where c.id = t.church_id))::date
     and (t.coming_back_on is null or t.coming_back_on < p_coming_back_on) then
    update public.church_threads set coming_back_on = p_coming_back_on where id = t.id;
    v_set := true;
  end if;

  if v_n > 0 or v_set then
    insert into public.church_audit_log (church_id, thread_id, message_id, actor_type, action, details)
    values (t.church_id, t.id, p_message, 'model', 'person.state_updated',
            jsonb_build_object('facts', v_n, 'coming_back', v_set,
                               'fields', (select coalesce(jsonb_agg(distinct e->>'field'), '[]'::jsonb) from jsonb_array_elements(coalesce(p_facts, '[]')) e)));
  end if;
  return v_n + case when v_set then 1 else 0 end;
end;
$$;

revoke execute on function public.agent_record_state(uuid, uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.agent_record_state(uuid, uuid, date, jsonb) to service_role;
