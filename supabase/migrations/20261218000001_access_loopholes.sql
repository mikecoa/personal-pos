-- Closing gaps in the per-page access (20261216000001):
--
-- * Roles are business-wide, so a manager editing or deleting a role would also change it for staff
--   at other outlets. Managers may now only edit / delete a role when everyone who has it works only
--   at the manager's own outlets. They can still give it to their staff, and create or duplicate
--   roles for their outlet.
-- * An employee's role could be switched straight in the database to one with backoffice access,
--   skipping save_employee's "only the owner grants backoffice access" check. Now refused for
--   anyone but the owner.

-- Giving a role to staff: permissions below your own (as before).
create or replace function app.role_below(p_role uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare r public.roles; mine public.roles;
begin
  select * into r from public.roles where id = p_role;
  if r.id is null then return false; end if;
  if app.account_role(r.account_id) = 'owner' then return true; end if;
  mine := app.my_role(r.account_id);
  if mine.id is null or mine.id = r.id then return false; end if;
  return app.perms_below(r.account_id, r.permissions, r.backoffice_pages, r.backoffice_write);
end $$;

-- Editing or deleting a role: also nobody with the role works at an outlet the manager doesn't manage.
create or replace function app.role_editable(p_role uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare r public.roles;
begin
  select * into r from public.roles where id = p_role;
  if r.id is null then return false; end if;
  if app.account_role(r.account_id) = 'owner' then return true; end if;
  if not app.role_below(p_role) then return false; end if;
  return not exists (
    select 1 from public.employees e join public.employee_locations el on el.employee_id = e.id
    where e.role_id = r.id
      and not exists (select 1 from public.member_locations ml where ml.location_id = el.location_id and ml.user_id = auth.uid()));
end $$;
grant execute on function app.role_editable(uuid) to authenticated;

do $$
declare v_src text;
begin
  select pg_get_functiondef('public.save_role(jsonb)'::regprocedure) into v_src;
  v_src := replace(v_src,
    $a$if not app.role_below(v_id) then raise exception 'You can only change roles below your own'$a$,
    $b$if not app.role_editable(v_id) then raise exception 'You can only change roles below your own that are used only at your outlets'$b$);
  execute v_src;
  select pg_get_functiondef('public.delete_role(uuid)'::regprocedure) into v_src;
  v_src := replace(v_src, 'or not app.role_below(p_role) then', 'or not app.role_editable(p_role) then');
  execute v_src;
end $$;

-- For the pages: roles you can give, roles you can edit, and employees you can manage.
create or replace function public.manageable(p_account uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'roles', coalesce((select jsonb_agg(r.id) from public.roles r where r.account_id = p_account and app.role_below(r.id)), '[]'),
    'editable', coalesce((select jsonb_agg(r.id) from public.roles r where r.account_id = p_account and app.role_editable(r.id)), '[]'),
    'employees', coalesce((select jsonb_agg(e.id) from public.employees e where e.account_id = p_account and app.can_manage_employee(e.id)), '[]'))
  where app.account_role(p_account) is not null
$$;

create or replace function app.employees_role_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or app.account_role(new.account_id) = 'owner' then return new; end if;
  if new.role_id is distinct from old.role_id
     and exists (select 1 from public.roles where id = new.role_id and cardinality(backoffice_pages) > 0) then
    raise exception 'Only the owner can give a role with backoffice access' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger employees_role_guard before update of role_id on public.employees
  for each row execute function app.employees_role_guard();
