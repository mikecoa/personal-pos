-- Tables are always square: the shape choice is gone from the backoffice and the tablets.
-- Existing round/long tables become square, and any shape sent later (e.g. by an older tablet app)
-- is saved as square.

update public.dining_tables set shape = 'square' where shape <> 'square';

create or replace function app.square_tables() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.shape := 'square';
  return new;
end $$;

create trigger dining_tables_square before insert or update of shape on public.dining_tables
  for each row execute function app.square_tables();
