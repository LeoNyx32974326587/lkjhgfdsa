-- Barbook: tables, rules and file storage for accounts, friends and features.
-- Run in Supabase: SQL Editor → New query → paste everything → Run.
-- Safe to run again after an update: it only adds what is missing and renews the rules.

-- ---------- tables ----------

-- Projects: the whole project as JSON, one row per project (user_id = owner)
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
-- owner of the project the file belongs to (differs from user_id when a featured friend uploads)
alter table public.files add column if not exists project_owner uuid references auth.users on delete cascade;
update public.files set project_owner = user_id where project_owner is null;
alter table public.files alter column project_owner set default auth.uid();

-- Profiles: the ID friends find you by, name, artist name, picture version
create table if not exists public.profiles (
  id uuid primary key default auth.uid() references auth.users on delete cascade,
  code text not null unique,
  name text not null default '',
  artist text not null default '',
  avatar bigint not null default 0
);

-- Friend requests; status 'pending' until the other one accepts
create table if not exists public.friendships (
  requester uuid not null references auth.users on delete cascade,
  addressee uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
create unique index if not exists friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));

-- Features: friends who may open and edit a project
create table if not exists public.project_members (
  owner uuid not null references auth.users on delete cascade,
  project_id text not null,
  member uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner, project_id, member)
);

-- ---------- helpers (run with full rights, so the rules below don't loop) ----------

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from friendships where status = 'accepted'
    and ((requester = a and addressee = b) or (requester = b and addressee = a)));
$$;

-- friends, or a request is open between the two
create or replace function public.are_related(a uuid, b uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from friendships
    where (requester = a and addressee = b) or (requester = b and addressee = a));
$$;

-- is the signed-in user featured on this project?
create or replace function public.is_member(o uuid, pid text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from project_members where owner = o and project_id = pid and member = auth.uid());
$$;

-- find someone by their ID ("#K7M2QX" or "k7m2qx")
create or replace function public.find_profile(c text)
returns table (id uuid, code text, name text, artist text, avatar bigint)
language sql security definer stable set search_path = public as $$
  select p.id, p.code, p.name, p.artist, p.avatar from profiles p
  where p.code = upper(replace(trim(c), '#', '')) and p.id <> auth.uid();
$$;
revoke execute on function public.find_profile(text) from anon, public;
grant execute on function public.find_profile(text) to authenticated;

-- ---------- rules: everyone only sees what is theirs or shared with them ----------

alter table public.projects enable row level security;
alter table public.files enable row level security;
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.project_members enable row level security;

drop policy if exists "own projects" on public.projects;
drop policy if exists "projects read" on public.projects;
drop policy if exists "projects insert" on public.projects;
drop policy if exists "projects update" on public.projects;
drop policy if exists "projects delete" on public.projects;
create policy "projects read" on public.projects for select to authenticated
  using (auth.uid() = user_id or public.is_member(user_id, id));
create policy "projects insert" on public.projects for insert to authenticated
  with check (auth.uid() = user_id or public.is_member(user_id, id));
create policy "projects update" on public.projects for update to authenticated
  using (auth.uid() = user_id or public.is_member(user_id, id))
  with check (auth.uid() = user_id or public.is_member(user_id, id));
create policy "projects delete" on public.projects for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "own files" on public.files;
drop policy if exists "files read" on public.files;
drop policy if exists "files insert" on public.files;
drop policy if exists "files update" on public.files;
drop policy if exists "files delete" on public.files;
create policy "files read" on public.files for select to authenticated
  using (auth.uid() = user_id or auth.uid() = project_owner or public.is_member(project_owner, project));
create policy "files insert" on public.files for insert to authenticated
  with check (auth.uid() = user_id and (auth.uid() = project_owner or public.is_member(project_owner, project)));
create policy "files update" on public.files for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "files delete" on public.files for delete to authenticated
  using (auth.uid() = user_id or auth.uid() = project_owner);

drop policy if exists "profiles read" on public.profiles;
drop policy if exists "profiles insert" on public.profiles;
drop policy if exists "profiles update" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.are_related(auth.uid(), id));
create policy "profiles insert" on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy "profiles update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "friendships read" on public.friendships;
drop policy if exists "friendships ask" on public.friendships;
drop policy if exists "friendships accept" on public.friendships;
drop policy if exists "friendships end" on public.friendships;
create policy "friendships read" on public.friendships for select to authenticated
  using (auth.uid() in (requester, addressee));
create policy "friendships ask" on public.friendships for insert to authenticated
  with check (requester = auth.uid() and status = 'pending');
create policy "friendships accept" on public.friendships for update to authenticated
  using (addressee = auth.uid()) with check (addressee = auth.uid() and status = 'accepted');
create policy "friendships end" on public.friendships for delete to authenticated
  using (auth.uid() in (requester, addressee));

drop policy if exists "members read" on public.project_members;
drop policy if exists "members add" on public.project_members;
drop policy if exists "members remove" on public.project_members;
create policy "members read" on public.project_members for select to authenticated
  using (auth.uid() in (owner, member));
create policy "members add" on public.project_members for insert to authenticated
  with check (auth.uid() = owner and public.are_friends(owner, member)
    and exists (select 1 from public.projects p where p.user_id = owner and p.id = project_id));
create policy "members remove" on public.project_members for delete to authenticated
  using (auth.uid() in (owner, member));

-- ---------- file storage: private bucket, a folder per user ----------

insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "own folder read" on storage.objects;
create policy "own folder read" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (
    (storage.foldername(name))[1] = auth.uid()::text
    -- friends' profile pictures
    or (name like '%/avatar.jpg' and public.are_related(auth.uid(), ((storage.foldername(name))[1])::uuid))
    -- beats and licenses of projects you are featured on
    or exists (select 1 from public.files f where f.path = objects.name
      and (f.project_owner = auth.uid() or public.is_member(f.project_owner, f.project)))
  ));

drop policy if exists "own folder write" on storage.objects;
create policy "own folder write" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own folder update" on storage.objects;
create policy "own folder update" on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own folder delete" on storage.objects;
create policy "own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (
    (storage.foldername(name))[1] = auth.uid()::text
    -- the project owner may clean up files a featured friend uploaded
    or exists (select 1 from public.files f where f.path = objects.name and f.project_owner = auth.uid())
  ));
