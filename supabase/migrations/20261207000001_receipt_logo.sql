-- Optional logo just for receipts (when it should differ from the location's logo).
-- Reuses the never-used receipt_profiles.logo_url column, renamed, with the same rules as
-- locations.logo: a small PNG / JPEG / WebP data URL. Empty = use the location's logo.
alter table public.receipt_profiles rename column logo_url to logo;
alter table public.receipt_profiles add constraint receipt_profiles_logo_chk
  check (logo is null or (char_length(logo) <= 300000 and logo ~ '^data:image/(png|jpeg|webp);base64,'));
