-- Public, read-only folder for Orda tablet app releases (APK + latest.json). The app checks
-- latest.json and offers to install newer versions. Only the project owner's CLI / service role
-- can upload (scripts/release-app.sh); there are no write policies for app users.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('app-releases', 'app-releases', true, 52428800,
        array['application/vnd.android.package-archive', 'application/json', 'application/octet-stream'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
