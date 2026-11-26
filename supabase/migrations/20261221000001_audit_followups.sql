-- Security audit follow-ups (the leads that needed a device or settings check).
--  1. Revoking a tablet now also ends the sign-in session it was set up with, and setting up a
--     tablet needs a fresh sign-in (within 15 minutes), so a session copied off a lost tablet
--     can't quietly register a new one.
--  2. A location that has used all 910 tablet codes gets a clear error instead of a stuck request.
--  3. One business per login (also enforced by the database, not only the onboarding page), and
--     size limits on what a tablet can upload in one call.

-- 1. Tablet sign-in sessions
alter table public.devices add column if not exists auth_session_id uuid;

create or replace function app.session_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif(auth.jwt()->>'session_id', '')::uuid
$$;

select app.patch_function('public.register_device(uuid, text)',
  '  select count(*) into v_n from public.devices where location_id = p_location;
',
  '  -- A tablet is set up right after signing in on it; an older session (e.g. copied off a lost
  -- tablet) must sign in again. Sessions without an id (tests, service jobs) skip this.
  if app.session_id() is not null and not exists (
      select 1 from auth.sessions s where s.id = app.session_id() and s.created_at > now() - interval ''15 minutes'') then
    raise exception ''Sign in again to set up this tablet'' using errcode = ''42501'';
  end if;
  select count(*) into v_n from public.devices where location_id = p_location;
  -- 2. Codes A1..ZZ (910) are never reused, so receipt numbers stay unique.
  if v_n >= 910 then
    raise exception ''This location has used all 910 tablet codes'' using errcode = ''54000'';
  end if;
');
select app.patch_function('public.register_device(uuid, text)',
  'insert into public.devices (account_id, location_id, name, receipt_prefix, registered_by)
  values (v_account, p_location, coalesce(nullif(trim(p_name), ''''), ''Tablet''), v_prefix, auth.uid())',
  'insert into public.devices (account_id, location_id, name, receipt_prefix, registered_by, auth_session_id)
  values (v_account, p_location, coalesce(nullif(trim(p_name), ''''), ''Tablet''), v_prefix, auth.uid(), app.session_id())');

-- Revoking ends that tablet's session (its refresh token stops working; an access token it
-- already holds expires within the hour). Other devices and the backoffice stay signed in.
create or replace function public.revoke_device(p_device uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_dev public.devices;
begin
  select * into v_dev from public.devices where id = p_device;
  if v_dev.id is null or not app.can_write(v_dev.location_id, 'settings_tablets') then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.devices set revoked_at = now() where id = p_device and revoked_at is null;
  if v_dev.auth_session_id is not null then
    delete from auth.sessions where id = v_dev.auth_session_id;
  end if;
end $$;

-- 3. One business per login.
select app.patch_function('public.create_account(text, text)',
  '  if v_uid is null then raise exception ''not authenticated''; end if;
',
  '  if v_uid is null then raise exception ''not authenticated''; end if;
  if exists (select 1 from public.members where user_id = v_uid) then
    raise exception ''You already belong to a business'' using errcode = ''23505'';
  end if;
');

-- Upload limits: real bills are far smaller.
create or replace function app.check_upload(p jsonb, p_limits jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare k text;
begin
  if octet_length(p::text) > 262144 then
    raise exception 'upload too large' using errcode = '54000';
  end if;
  for k in select jsonb_object_keys(p_limits) loop
    if jsonb_typeof(p->k) = 'array' and jsonb_array_length(p->k) > (p_limits->>k)::int then
      raise exception 'too many % in one upload', k using errcode = '54000';
    end if;
  end loop;
end $$;

select app.patch_function('public.upsert_order(uuid, jsonb)',
  '  v_cust     uuid;
begin
',
  '  v_cust     uuid;
begin
  perform app.check_upload(p, ''{"lines": 500, "discounts": 50, "payments": 50, "voids": 500}'');
');
select app.patch_function('public.upsert_shift(uuid, jsonb)',
  '  v_existing public.shifts;
begin
',
  '  v_existing public.shifts;
begin
  perform app.check_upload(p, ''{"movements": 500}'');
');
select app.patch_function('public.submit_refund(uuid, jsonb)',
  '  v_prior  bigint;
begin
',
  '  v_prior  bigint;
begin
  perform app.check_upload(p, ''{"lines": 500}'');
');
