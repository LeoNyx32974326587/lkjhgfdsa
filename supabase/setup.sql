-- Barbook: tables and file storage for accounts.
-- Run once in Supabase: SQL Editor → New query → paste everything → Run.

-- Projects: the whole project as JSON, one row per project and user
create table if not exists public.projects (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  data jsonb not null,
  updated bigint not null,
  primary key (user_id, id)
);

-- Files (beats, license documents): a row here, the file itself in the bucket "files"
create table if not exists public.files (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  project text not null,
  name text not null default '',
  type text not null default '',
  path text not null,
  primary key (user_id, id)
);

-- Everyone only sees and changes their own rows
alter table public.projects enable row level security;
alter table public.files enable row level security;

drop policy if exists "own projects" on public.projects;
create policy "own projects" on public.projects for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own files" on public.files;
create policy "own files" on public.files for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private bucket; every user has a folder named after their user id
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "own folder read" on storage.objects;
create policy "own folder read" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own folder write" on storage.objects;
create policy "own folder write" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own folder update" on storage.objects;
create policy "own folder update" on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own folder delete" on storage.objects;
create policy "own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);
