-- Separate receipt links, like Moka: Instagram, website and TikTok (instead of one "social" box).
-- The tablet's catalogue already sends the whole receipt row (to_jsonb), so tablets get these too.
-- `social` stays: the backoffice keeps it filled with a combined line so older app versions still
-- print the links.

alter table public.receipt_profiles
  add column instagram text check (char_length(instagram) <= 80),
  add column website   text check (char_length(website)   <= 80),
  add column tiktok    text check (char_length(tiktok)    <= 80);

-- Move what's in `social` today into the matching new box.
update public.receipt_profiles
   set website = social
 where social is not null and btrim(social) <> ''
   and (social ~* '^https?://' or social ~* '^www\.' or social ~* '\.(com|id|co|net|org|io|me|app)(/|$)');

update public.receipt_profiles
   set instagram = regexp_replace(btrim(social), '^(https?://)?(www\.)?instagram\.com/', '', 'i')
 where social is not null and btrim(social) <> '' and website is null;
