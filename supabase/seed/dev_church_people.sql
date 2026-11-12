-- DEV ONLY: sample guests for the People page, until Subsplash intake fills church_people.
-- Never run this against production. Every guest here is made up (synthetic data only).
--
-- 1. Change v_owner_email below to the email you sign in to the app with.
-- 2. Run the whole file in the SQL Editor of the 1stayz-app-dev project (or with psql).
--
-- It adds 12 guests to the church that email owns, with visits, household members, notes and
-- consent. It refuses to run if that church already has guests, so it can't double up.
-- To remove them again: delete from public.church_people where church_id = '<your church id>';

do $$
declare
  v_owner_email text := 'you@example.com';  -- <- change me
  v_church      uuid;
  v_sunday      timestamptz := date_trunc('week', now()) - interval '1 day' + interval '15 hours';  -- last Sunday, ~10am Central
  v_id          uuid;
  g             record;
begin
  select m.church_id into v_church
  from public.church_members m
  join auth.users u on u.id = m.user_id
  where lower(u.email) = lower(v_owner_email) and m.is_owner
  limit 1;

  if v_church is null then
    raise exception 'No church owned by %. Set v_owner_email to the email you sign in with.', v_owner_email;
  end if;
  if exists (select 1 from public.church_people where church_id = v_church) then
    raise exception 'This church already has guests; seed not run.';
  end if;

  for g in
    select * from (values
      -- first, last, email, phone, city, stage, review, interests, weeks_ago (visits), source, service
      ('Marcus', 'Whitfield', 'marcus.whitfield@example.com', '(217) 555-0193', 'Springfield', 'engaged',   false, array['Kids Ministry', 'Newcomers lunch'], array[0],    'connect_card', '10:30 service'),
      ('Hannah', 'Brooks',    'hbrooks@example.com',          '(217) 555-0161', 'Chatham',     'escalated', false, array['Prayer'],                          array[0],    'connect_card', '10:30 service'),
      ('Jordan', 'Ellis',     'jordan.ellis@example.com',     '(217) 555-0154', 'Springfield', 'escalated', false, array['Theology questions'],              array[1],    'subsplash',    '9:00 service'),
      ('Maya',   'Thompson',  'maya.t@example.com',           '(217) 555-0147', 'Rochester',   'engaged',   false, array['Kids Ministry', 'Midweek childcare'], array[1],  'subsplash',    '10:30 service'),
      ('Chinedu','Okafor',    'c.okafor@example.com',         '(217) 555-0128', 'Springfield', 'scheduled', false, array['Worship team', 'Students'],       array[0, 2], 'website',      '9:00 service'),
      ('Daniel', 'Park',      'dpark@example.com',            '(217) 555-0168', 'Sherman',     'scheduled', false, array['Alpha course', 'Couples group'],  array[1],    'connect_card', '10:30 service'),
      ('Sofia',  'Ramirez',   null,                           '(217) 555-0175', 'Springfield', 'thanked',   false, array[]::text[],                        array[0],    'text_in',      '10:30 service'),
      ('Grace',  'Liu',       'grace.liu@example.com',        null,             'Springfield', 'new',       false, array['Small groups'],                  array[0],    'website',      '9:00 service'),
      ('Ethan',  'Brooks',    null,                           '(217) 555-0161', 'Chatham',     'new',       true,  array[]::text[],                        array[0],    'connect_card', '10:30 service'),
      ('Priya',  'Shah',      'priya.shah@example.com',       '(217) 555-0139', 'Springfield', 'contacted', false, array['Volunteering'],                  array[2],    'subsplash',    '9:00 service'),
      ('Tom',    'Becker',    'tbecker@example.com',          '(217) 555-0112', 'Auburn',      'returned',  false, array['Men''s breakfast'],              array[0, 3], 'connect_card', '9:00 service'),
      ('Ruth',   'Adeyemi',   'ruth.a@example.com',           '(217) 555-0186', 'Springfield', 'integrated',false, array['Choir', 'Small groups'],         array[1, 3, 5], 'subsplash', '10:30 service')
    ) as t(first, last, email, phone, city, stage, review, interests, weeks, source, service)
  loop
    insert into public.church_people (church_id, first_name, last_name, email, phone, city, stage, needs_review, interests,
      preferred_channel)
    values (v_church, g.first, g.last, g.email, g.phone, g.city, g.stage, g.review, g.interests,
      case when g.phone is null then 'email' else 'sms' end)
    returning id into v_id;

    insert into public.church_visits (church_id, person_id, visited_at, service_name, source, source_event_id, logged_by)
    select v_church, v_id, v_sunday - make_interval(weeks => w), g.service, g.source, 'dev-seed-' || v_id || '-' || w, null
    from unnest(g.weeks) as w;

    insert into public.church_consents (church_id, person_id, channel, status, source, event_at)
    select v_church, v_id, ch, 'granted', case when g.source = 'subsplash' then 'subsplash' else 'connect_card' end,
      v_sunday - make_interval(weeks => g.weeks[array_length(g.weeks, 1)])
    from unnest(array[case when g.phone is not null then 'sms' end, case when g.email is not null then 'email' end]) as ch
    where ch is not null;
  end loop;

  -- A few details for the person pages.
  insert into public.church_household_members (church_id, person_id, name, relation, age, position)
  select v_church, p.id, h.name, h.relation, h.age, h.pos
  from public.church_people p
  join (values ('Marcus', 'Danielle', 'spouse', null::int, 0), ('Marcus', 'Ava', 'child', 7, 1), ('Marcus', 'Eli', 'child', 4, 2),
               ('Daniel', 'Hye-jin', 'spouse', null, 0)) as h(first, name, relation, age, pos)
    on h.first = p.first_name
  where p.church_id = v_church;

  insert into public.church_person_facts (church_id, person_id, value, data_class, source, event_at, actor)
  select v_church, p.id, f.value, f.class, f.source, v_sunday + interval '6 hours', null
  from public.church_people p
  join (values
    ('Marcus', 'Moved here in August for a new job', 'C2', 'subsplash'),
    ('Marcus', 'Asked whether there are weekday moms'' groups', 'C2', 'guest'),
    ('Hannah', 'Shared that her mother passed away recently', 'C3', 'guest'),
    ('Jordan', 'Asked how the church views baptism', 'C2', 'guest'),
    ('Chinedu', 'Plays bass; interested in the worship team', 'C2', 'subsplash'),
    ('Ethan', 'Gave the same phone number as Hannah Brooks', 'C1', 'subsplash')
  ) as f(first, value, class, source) on f.first = p.first_name
  where p.church_id = v_church;

  raise notice 'Added 12 sample guests to church %.', v_church;
end;
$$;
