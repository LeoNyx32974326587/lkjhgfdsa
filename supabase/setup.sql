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
-- what the friend may change: {"text": true, "beat": false, "license": false, "info": false, "status": false}
alter table public.project_members add column if not exists rights jsonb not null default '{}'::jsonb;
-- an invitation counts once the friend accepts it; the song title is shown in the invitation
alter table public.project_members add column if not exists title text not null default '';
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'project_members' and column_name = 'accepted') then
    alter table public.project_members add column accepted boolean not null default true;   -- features from before: already in
    alter table public.project_members alter column accepted set default false;
  end if;
end $$;

-- Comments on lines of a song, by the owner and featured friends
create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  project_id text not null,
  author uuid not null default auth.uid() references auth.users on delete cascade,
  author_name text not null default '',
  section text not null default '',
  line text not null default '',
  line_no int not null default 0,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists project_comments_project on public.project_comments (owner, project_id);

-- Saved states of a song's text (version history), the newest 100 per song
create table if not exists public.project_versions (
  owner uuid not null references auth.users on delete cascade,
  id text not null,
  project_id text not null,
  author uuid not null default auth.uid() references auth.users on delete cascade,
  author_name text not null default '',
  title text not null default '',
  text text not null default '',
  created bigint not null,
  primary key (owner, id)
);
create index if not exists project_versions_project on public.project_versions (owner, project_id, created desc);

-- Bars: lines and ideas that do not belong to a song yet, private to their author
create table if not exists public.bars (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  data jsonb not null,
  updated bigint not null,
  primary key (user_id, id)
);

-- Read links: anyone with the link may read the song text, without an account
create table if not exists public.share_links (
  token text primary key check (length(token) >= 20),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  project_id text not null,
  created bigint not null default (extract(epoch from now()) * 1000)::bigint,
  unique (owner, project_id)
);

-- Messages in the friends area ("Bea hat dich als Freund entfernt"), written by the triggers below
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  actor uuid,                 -- who did it (no reference: the account may be gone)
  actor_name text not null default '',
  title text not null default '',
  created timestamptz not null default now(),
  read boolean not null default false
);
create index if not exists notifications_user on public.notifications (user_id, created desc);

-- Chat between friends
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  sender uuid not null default auth.uid() references auth.users on delete cascade,
  recipient uuid not null references auth.users on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 4000),
  created timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists chat_messages_pair on public.chat_messages (least(sender, recipient), greatest(sender, recipient), id desc);
create index if not exists chat_messages_unread on public.chat_messages (recipient) where read_at is null;

-- AI requests per account and day (the Edge Function "claude" counts them; nobody reads this table directly)
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
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
  select exists (select 1 from project_members where owner = o and project_id = pid and member = auth.uid() and accepted);
$$;

-- may the signed-in user change this part ('text', 'beat', 'license', 'info', 'status') of the project?
create or replace function public.member_can(o uuid, pid text, what text) returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select (rights ->> what)::boolean from project_members
    where owner = o and project_id = pid and member = auth.uid() and accepted), false);
$$;

-- A featured friend's save keeps everything they may not change as it was.
create or replace function public.guard_member_edit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  k text;
  locked text[] := array['features', 'featureOn', 'ownerName', 'deletedAt'];   -- only the owner
begin
  -- the version time never goes back (an old copy must not look newer than the latest save)
  new.updated := greatest(old.updated, new.updated);
  if auth.uid() is null or auth.uid() = old.user_id then return new; end if;
  select rights into r from project_members where owner = old.user_id and project_id = old.id and member = auth.uid();
  r := coalesce(r, '{}'::jsonb);
  if not coalesce((r ->> 'text')::boolean, false) then locked := locked || array['text']; end if;
  if not coalesce((r ->> 'beat')::boolean, false) then locked := locked || array['beat', 'youtube', 'markers']; end if;
  if not coalesce((r ->> 'license')::boolean, false) then locked := locked || array['license']; end if;
  if not coalesce((r ->> 'info')::boolean, false) then locked := locked || array['title', 'bpm', 'key', 'genres', 'langs', 'lang', 'topic']; end if;
  if not coalesce((r ->> 'status')::boolean, false) then locked := locked || array['status', 'release', 'kind']; end if;
  foreach k in array locked loop
    if old.data ? k then new.data := jsonb_set(new.data, array[k], old.data -> k);
    else new.data := new.data - k; end if;
  end loop;
  new.user_id := old.user_id;
  new.id := old.id;
  new.updated := greatest(old.updated, new.updated);
  return new;
end;
$$;
drop trigger if exists guard_member_edit on public.projects;
create trigger guard_member_edit before update on public.projects
  for each row execute function public.guard_member_edit();

-- Invitations: the owner sets title and rights, only the friend can accept
create or replace function public.guard_member_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.owner := old.owner;
  new.project_id := old.project_id;
  new.member := old.member;
  if auth.uid() = old.member then
    new.rights := old.rights;
    new.title := old.title;
  else
    new.accepted := old.accepted;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_member_row on public.project_members;
create trigger guard_member_row before update on public.project_members
  for each row execute function public.guard_member_row();

-- a deleted project takes its features along
create or replace function public.drop_project_members() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from project_members where owner = old.user_id and project_id = old.id;
  delete from project_comments where owner = old.user_id and project_id = old.id;
  delete from project_versions where owner = old.user_id and project_id = old.id;
  delete from share_links where owner = old.user_id and project_id = old.id;
  return old;
end;
$$;
drop trigger if exists drop_project_members on public.projects;
create trigger drop_project_members after delete on public.projects
  for each row execute function public.drop_project_members();

-- ending a friendship ends every feature between the two, in both directions
create or replace function public.drop_features_on_unfriend() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from project_members
  where (owner = old.requester and member = old.addressee) or (owner = old.addressee and member = old.requester);
  return old;
end;
$$;
drop trigger if exists drop_features_on_unfriend on public.friendships;
create trigger drop_features_on_unfriend after delete on public.friendships
  for each row execute function public.drop_features_on_unfriend();

-- ---------- messages for the friends area ----------
-- the name a person shows up with: artist name, else name, else their ID
create or replace function public.display_name(u uuid) returns text
language sql security definer stable set search_path = public as $$
  select coalesce(nullif(p.artist, ''), nullif(p.name, ''), '#' || p.code, 'Jemand') from profiles p where p.id = u
  union all select 'Jemand' limit 1;
$$;
create or replace function public.notify(target uuid, k text, who uuid, song text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if target is null or target = who or not exists (select 1 from auth.users where id = target) then return; end if;
  -- an account being deleted: delete_my_account() has already told the friends
  if current_setting('barbook.deleting', true) = 'on' or (who is not null and not exists (select 1 from auth.users where id = who)) then return; end if;
  insert into notifications (user_id, kind, actor, actor_name, title) values (target, k, who, display_name(who), coalesce(song, ''));
  -- keep the last 50 per person
  delete from notifications n where n.user_id = target and n.id not in
    (select id from notifications where user_id = target order by created desc limit 50);
end;
$$;
revoke execute on function public.notify(uuid, text, uuid, text) from anon, authenticated, public;
revoke execute on function public.display_name(uuid) from anon, public;

create or replace function public.notify_friendship() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if tg_op = 'UPDATE' then
    if old.status = 'pending' and new.status = 'accepted' then perform notify(new.requester, 'accepted', new.addressee, null); end if;
    return new;
  end if;
  if old.status = 'accepted' then
    -- the one who ended it is me; the other one gets the message (account deletion: no session, take the deleted side)
    if me is null then me := case when exists (select 1 from auth.users where id = old.requester) then old.addressee else old.requester end; end if;
    perform notify(case when me = old.requester then old.addressee else old.requester end, 'unfriended', me, null);
  elsif me = old.addressee then
    perform notify(old.requester, 'declined_friend', old.addressee, null);
  end if;
  return old;
end;
$$;
drop trigger if exists notify_friendship on public.friendships;
create trigger notify_friendship after update or delete on public.friendships
  for each row execute function public.notify_friendship();

create or replace function public.notify_member() returns trigger
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if tg_op = 'UPDATE' then
    if not old.accepted and new.accepted then perform notify(new.owner, 'joined', new.member, new.title); end if;
    return new;
  end if;
  -- gone with the friendship or the song: the friendship message says enough
  if not are_friends(old.owner, old.member) or not exists (select 1 from projects where user_id = old.owner and id = old.project_id) then
    return old;
  end if;
  if me = old.owner then
    if old.accepted then perform notify(old.member, 'removed', old.owner, old.title); end if;
  elsif me = old.member then
    perform notify(old.owner, case when old.accepted then 'left' else 'declined_invite' end, old.member, old.title);
  end if;
  return old;
end;
$$;
drop trigger if exists notify_member on public.project_members;
create trigger notify_member after update or delete on public.project_members
  for each row execute function public.notify_member();

-- the chat partner has read everything up to now
create or replace function public.chat_mark_read(other uuid) returns void
language sql security definer set search_path = public as $$
  update chat_messages set read_at = now() where recipient = auth.uid() and sender = other and read_at is null;
$$;
revoke execute on function public.chat_mark_read(uuid) from anon, public;
grant execute on function public.chat_mark_read(uuid) to authenticated;

-- keep the newest 100 saved states per song
create or replace function public.trim_versions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from project_versions v where v.owner = new.owner and v.project_id = new.project_id
    and v.id not in (select id from project_versions where owner = new.owner and project_id = new.project_id
                     order by created desc limit 100);
  return null;
end;
$$;
drop trigger if exists trim_versions on public.project_versions;
create trigger trim_versions after insert on public.project_versions
  for each row execute function public.trim_versions();

-- find someone by their ID ("#K7M2QX" or "k7m2qx")
create or replace function public.find_profile(c text)
returns table (id uuid, code text, name text, artist text, avatar bigint)
language sql security definer stable set search_path = public as $$
  select p.id, p.code, p.name, p.artist, p.avatar from profiles p
  where p.code = upper(replace(trim(c), '#', '')) and p.id <> auth.uid();
$$;
revoke execute on function public.find_profile(text) from anon, public;
grant execute on function public.find_profile(text) to authenticated;

-- the song behind a read link: only what the read page shows, never the files or the friends
create or replace function public.shared_project(t text) returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'title', p.data ->> 'title', 'text', p.data ->> 'text', 'bpm', p.data ->> 'bpm', 'key', p.data ->> 'key',
    'genres', coalesce(p.data -> 'genres', '[]'::jsonb), 'updated', p.updated,
    'artist', coalesce(nullif(pr.artist, ''), nullif(pr.name, ''), ''))
  from share_links s
  join projects p on p.user_id = s.owner and p.id = s.project_id
  left join profiles pr on pr.id = s.owner
  where s.token = t and (p.data ->> 'deletedAt') is null;
$$;
revoke execute on function public.shared_project(text) from public;
grant execute on function public.shared_project(text) to anon, authenticated;

-- "Account löschen": removes the signed-in user; every table above goes along (on delete cascade).
-- The app deletes the stored files first, the database cannot remove those itself.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare f record;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  -- friends hear about it while the name is still there; the triggers stay quiet afterwards
  for f in select case when requester = auth.uid() then addressee else requester end as other
           from friendships where status = 'accepted' and auth.uid() in (requester, addressee) loop
    insert into notifications (user_id, kind, actor, actor_name) values (f.other, 'gone', auth.uid(), display_name(auth.uid()));
  end loop;
  perform set_config('barbook.deleting', 'on', true);
  delete from auth.users where id = auth.uid();
end;
$$;
-- takes one AI request off today's allowance; false when it is used up
create or replace function public.ai_take(max_per_day int) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return false; end if;
  delete from ai_usage where user_id = auth.uid() and day < current_date - 7;
  insert into ai_usage (user_id, day, count) values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set count = ai_usage.count + 1 where ai_usage.count < max_per_day
  returning count into n;
  return n is not null;
end;
$$;
revoke execute on function public.ai_take(int) from anon, public;
grant execute on function public.ai_take(int) to authenticated;

revoke execute on function public.delete_my_account() from anon, public;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- rules: everyone only sees what is theirs or shared with them ----------

alter table public.projects enable row level security;
alter table public.files enable row level security;
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.project_members enable row level security;
alter table public.project_comments enable row level security;
alter table public.project_versions enable row level security;
alter table public.bars enable row level security;
alter table public.share_links enable row level security;
alter table public.notifications enable row level security;
alter table public.chat_messages enable row level security;
alter table public.ai_usage enable row level security;   -- no policies: only ai_take() touches it

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
  with check (auth.uid() = user_id and (auth.uid() = project_owner
    or public.member_can(project_owner, project, 'beat') or public.member_can(project_owner, project, 'license')
    or public.member_can(project_owner, project, 'status')));
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
drop policy if exists "members rights" on public.project_members;
create policy "members read" on public.project_members for select to authenticated
  using (auth.uid() in (owner, member));
create policy "members add" on public.project_members for insert to authenticated
  with check (auth.uid() = owner and not accepted and public.are_friends(owner, member)
    and exists (select 1 from public.projects p where p.user_id = owner and p.id = project_id));
create policy "members remove" on public.project_members for delete to authenticated
  using (auth.uid() in (owner, member));
create policy "members rights" on public.project_members for update to authenticated
  using (auth.uid() in (owner, member)) with check (auth.uid() in (owner, member) and public.are_friends(owner, member));

drop policy if exists "comments read" on public.project_comments;
drop policy if exists "comments write" on public.project_comments;
drop policy if exists "comments delete" on public.project_comments;
create policy "comments read" on public.project_comments for select to authenticated
  using (auth.uid() = owner or public.is_member(owner, project_id));
create policy "comments write" on public.project_comments for insert to authenticated
  with check (author = auth.uid() and (auth.uid() = owner or public.is_member(owner, project_id)));
create policy "comments delete" on public.project_comments for delete to authenticated
  using (author = auth.uid() or owner = auth.uid());

drop policy if exists "versions read" on public.project_versions;
drop policy if exists "versions write" on public.project_versions;
drop policy if exists "versions delete" on public.project_versions;
create policy "versions read" on public.project_versions for select to authenticated
  using (auth.uid() = owner or public.is_member(owner, project_id));
create policy "versions write" on public.project_versions for insert to authenticated
  with check (author = auth.uid() and (auth.uid() = owner or public.member_can(owner, project_id, 'text')));
create policy "versions delete" on public.project_versions for delete to authenticated
  using (auth.uid() = owner);

drop policy if exists "own messages read" on public.notifications;
drop policy if exists "own messages mark" on public.notifications;
drop policy if exists "own messages delete" on public.notifications;
create policy "own messages read" on public.notifications for select to authenticated using (auth.uid() = user_id);
create policy "own messages mark" on public.notifications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own messages delete" on public.notifications for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "chat read" on public.chat_messages;
drop policy if exists "chat write" on public.chat_messages;
create policy "chat read" on public.chat_messages for select to authenticated using (auth.uid() in (sender, recipient));
create policy "chat write" on public.chat_messages for insert to authenticated
  with check (sender = auth.uid() and read_at is null and public.are_friends(sender, recipient));

drop policy if exists "own bars" on public.bars;
create policy "own bars" on public.bars for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own links" on public.share_links;
create policy "own links" on public.share_links for all to authenticated
  using (auth.uid() = owner)
  with check (auth.uid() = owner and exists (select 1 from public.projects p where p.user_id = owner and p.id = project_id));

-- ---------- live updates (Supabase Realtime) ----------
-- new messages, friend requests and song invitations reach the open app right away; the rules above still apply
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['notifications', 'friendships', 'project_members', 'chat_messages'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

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
