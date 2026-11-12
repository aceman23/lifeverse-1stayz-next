-- SMS Terms and Privacy Policy for each church's guest texting (onboarding step 4).
--
-- Carriers approve a church's text number (10DLC) only if public SMS Terms and a Privacy Policy,
-- in the church's name, are reachable without a login. A church either:
--   'church_site'  hosts them on its own website and gives us the two links, or
--   '1stayz'       has 1Stayz host them at 1stayz.com/<slug>/sms-terms and /<slug>/privacy.
--
-- For '1stayz', the owner previews both documents and approves them. Approval stores a snapshot
-- of the church details the documents are written with, plus the template version, so the public
-- pages always show exactly what was approved. Changing details later doesn't change the pages
-- until the owner approves again. The slug is set on first approval and never changes, because
-- the URLs are registered with the carriers.

create table public.church_sms_policies (
  church_id         uuid primary key references public.churches (id) on delete cascade,
  hosting           text not null check (hosting in ('church_site', '1stayz')),
  -- 'church_site': the church's own public pages.
  terms_url         text check (terms_url ~ '^https://[^\s/]+\.[^\s/]+(/\S*)?$' and length(terms_url) <= 500),
  privacy_url       text check (privacy_url ~ '^https://[^\s/]+\.[^\s/]+(/\S*)?$' and length(privacy_url) <= 500),
  -- '1stayz': where guests can reach the church about texts (shown in both documents).
  contact_email     text check (contact_email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' and length(contact_email) <= 254),
  slug              text unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  template_version  int check (template_version >= 1),
  -- { church_name, phone, email, website, address }: the details the approved documents use.
  snapshot          jsonb,
  approved_by_name  text check (length(approved_by_name) <= 200),
  approved_by_user  uuid references auth.users (id) on delete set null,
  approved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check ((approved_at is null) = (snapshot is null) and (approved_at is null) = (template_version is null)),
  check (approved_at is null or slug is not null)
);

create trigger church_sms_policies_set_updated_at
  before update on public.church_sms_policies
  for each row execute function public.set_updated_at();

-- Staff read their church's row; writes only through the functions below.
revoke all on public.church_sms_policies from anon, authenticated;
grant select on public.church_sms_policies to authenticated;
create policy "church_sms_policies: members can read" on public.church_sms_policies
  for select to authenticated using (public.is_church_member(church_id));

-- "Redemption Hills Church!" -> "redemption-hills-church"
create or replace function public.sms_policy_slug_base(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(trim(both '-' from left(trim(both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g')), 50)), ''), 'church');
$$;

-- ---------------------------------------------------------------------------
-- Step 4 save (owner): where the documents live, and the contact email.
-- Leaves any approval alone; the public pages change only on approval.
-- ---------------------------------------------------------------------------
create or replace function public.save_onboarding_sms_policy(
  p_hosting        text,
  p_terms_url      text,
  p_privacy_url    text,
  p_contact_email  text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_church uuid := public.onboarding_church_id();
begin
  if p_hosting is null then
    return; -- not chosen yet
  end if;
  insert into public.church_sms_policies (church_id, hosting, terms_url, privacy_url, contact_email)
  values (v_church, p_hosting, nullif(btrim(p_terms_url), ''), nullif(btrim(p_privacy_url), ''),
          nullif(lower(btrim(p_contact_email)), ''))
  on conflict (church_id) do update set
    hosting       = excluded.hosting,
    terms_url     = excluded.terms_url,
    privacy_url   = excluded.privacy_url,
    contact_email = excluded.contact_email;
end;
$$;

-- ---------------------------------------------------------------------------
-- Approve and publish (owner, '1stayz' hosting). The documents are written from the church's
-- saved details at this moment; the approver is the signed-in owner.
-- Returns { slug, template_version, snapshot, approved_by_name, approved_at }.
-- ---------------------------------------------------------------------------
create or replace function public.approve_sms_policy(p_contact_email text, p_template_version int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_church   uuid := public.onboarding_church_id();
  v_row      public.churches%rowtype;
  v_name     text;
  v_slug     text;
  v_base     text;
  v_n        int := 1;
  v_snapshot jsonb;
  v_result   public.church_sms_policies%rowtype;
begin
  if p_template_version is distinct from 1 then
    raise exception 'Unknown template version.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_contact_email), '') !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
    raise exception 'Add a contact email for guests.' using errcode = '22023';
  end if;

  select * into v_row from public.churches where id = v_church;
  select m.full_name into v_name from public.church_members m where m.church_id = v_church and m.user_id = auth.uid();

  -- Keep an existing slug; otherwise take the first free one.
  select p.slug into v_slug from public.church_sms_policies p where p.church_id = v_church for update;
  if v_slug is null then
    v_base := public.sms_policy_slug_base(v_row.name);
    v_slug := v_base;
    while exists (select 1 from public.church_sms_policies p where p.slug = v_slug and p.church_id <> v_church) loop
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    end loop;
  end if;

  v_snapshot := jsonb_build_object(
    'church_name', v_row.name,
    'phone', coalesce(v_row.phone, ''),
    'email', lower(btrim(p_contact_email)),
    'website', coalesce(v_row.website, ''),
    'address', coalesce(v_row.address, ''));

  insert into public.church_sms_policies
    (church_id, hosting, contact_email, slug, template_version, snapshot, approved_by_name, approved_by_user, approved_at)
  values (v_church, '1stayz', lower(btrim(p_contact_email)), v_slug, p_template_version, v_snapshot, v_name, auth.uid(), now())
  on conflict (church_id) do update set
    hosting          = '1stayz',
    contact_email    = excluded.contact_email,
    slug             = excluded.slug,
    template_version = excluded.template_version,
    snapshot         = excluded.snapshot,
    approved_by_name = excluded.approved_by_name,
    approved_by_user = excluded.approved_by_user,
    approved_at      = excluded.approved_at
  returning * into v_result;

  return jsonb_build_object(
    'slug', v_result.slug,
    'template_version', v_result.template_version,
    'snapshot', v_result.snapshot,
    'approved_by_name', v_result.approved_by_name,
    'approved_at', v_result.approved_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- The public pages (no login): the approved documents of a church that has 1Stayz host them.
-- Returns { template_version, snapshot, approved_at } or null.
-- ---------------------------------------------------------------------------
create or replace function public.published_sms_policy(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('template_version', p.template_version, 'snapshot', p.snapshot, 'approved_at', p.approved_at)
  from public.church_sms_policies p
  where p.slug = lower(p_slug) and p.hosting = '1stayz' and p.approved_at is not null;
$$;

revoke execute on function public.save_onboarding_sms_policy(text, text, text, text) from public, anon;
revoke execute on function public.approve_sms_policy(text, int) from public, anon;
revoke execute on function public.published_sms_policy(text) from public;
grant execute on function public.save_onboarding_sms_policy(text, text, text, text) to authenticated;
grant execute on function public.approve_sms_policy(text, int) to authenticated;
grant execute on function public.published_sms_policy(text) to anon, authenticated, service_role;
