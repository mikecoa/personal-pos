-- The employees table only exposes listed columns (PIN hashes stay hidden); add the new ones.
grant select (email, user_id) on public.employees to authenticated;
