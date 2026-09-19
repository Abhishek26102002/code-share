-- Workspace feature: accounts, nested rooms, tabs, room keys, teams.
-- Labels (room names and tab titles) are stored as ciphertext produced in the
-- browser, exactly like room content, so a row read tells you nothing readable.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles: a readable mirror of auth.users for team screens
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

insert into public.profiles (id, email, display_name)
select id, lower(coalesce(email, '')), split_part(coalesce(email, ''), '@', 1)
from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- rooms: owned, nestable one level deep, optional expiry
-- ---------------------------------------------------------------------------
alter table public.rooms
  add column if not exists owner_id uuid references auth.users (id) on delete cascade,
  add column if not exists parent_id text references public.rooms (id) on delete cascade,
  add column if not exists encrypted_name text not null default '';

alter table public.rooms alter column expires_at drop not null;

alter table public.rooms drop constraint if exists rooms_expiry_window;
alter table public.rooms add constraint rooms_expiry_window
  check (expires_at is null or expires_at > created_at);

-- a room without an account always expires; only accounts get "never"
alter table public.rooms drop constraint if exists rooms_anonymous_expiry;
alter table public.rooms add constraint rooms_anonymous_expiry
  check (owner_id is not null or expires_at is not null);

create index if not exists rooms_owner_id_idx on public.rooms (owner_id);
create index if not exists rooms_parent_id_idx on public.rooms (parent_id);

-- rooms nest exactly one level: a room -> its subrooms -> tabs
create or replace function public.rooms_enforce_depth()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'a room cannot be its own parent';
  end if;

  if exists (select 1 from public.rooms p where p.id = new.parent_id and p.parent_id is not null) then
    raise exception 'rooms only nest one level deep';
  end if;

  if exists (select 1 from public.rooms c where c.parent_id = new.id) then
    raise exception 'a room that already holds subrooms cannot become a subroom';
  end if;

  return new;
end;
$$;

drop trigger if exists rooms_enforce_depth on public.rooms;

create trigger rooms_enforce_depth
before insert or update of parent_id on public.rooms
for each row
execute function public.rooms_enforce_depth();

-- ---------------------------------------------------------------------------
-- room_tabs: the editable documents inside a room
-- ---------------------------------------------------------------------------
create table if not exists public.room_tabs (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms (id) on delete cascade,
  encrypted_title text not null default '',
  encrypted_content text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists room_tabs_room_id_idx on public.room_tabs (room_id, position);

drop trigger if exists room_tabs_set_updated_at on public.room_tabs;

create trigger room_tabs_set_updated_at
before update on public.room_tabs
for each row
execute function public.set_updated_at();

-- move every existing room's content into its first tab
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'rooms' and column_name = 'encrypted_content'
  ) then
    execute $migrate$
      insert into public.room_tabs (room_id, encrypted_title, encrypted_content, position)
      select r.id, '', r.encrypted_content, 0
      from public.rooms r
      where not exists (select 1 from public.room_tabs t where t.room_id = r.id)
    $migrate$;

    execute 'alter table public.rooms drop column encrypted_content';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- room_keys: the AES key for account rooms, readable by owner and team only
-- ---------------------------------------------------------------------------
create table if not exists public.room_keys (
  room_id text primary key references public.rooms (id) on delete cascade,
  encryption_key text not null,
  created_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null default 'My team',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (team_id, user_id)
);

create index if not exists team_members_user_id_idx on public.team_members (user_id);

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'revoked')),
  created_at timestamptz not null default timezone('utc', now()),
  responded_at timestamptz
);

create unique index if not exists team_invites_pending_idx
  on public.team_invites (team_id, lower(email))
  where status = 'pending';

create index if not exists team_invites_email_idx on public.team_invites (lower(email));

-- ---------------------------------------------------------------------------
-- account deletion requests (a human or a scheduled job completes these)
-- ---------------------------------------------------------------------------
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'cancelled', 'completed')),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists account_deletion_requests_pending_idx
  on public.account_deletion_requests (user_id)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- expiry cleanup now has to skip rooms that never expire
-- ---------------------------------------------------------------------------
create or replace function public.delete_expired_rooms()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  -- account rooms are kept: the owner decides whether to reactivate or delete
  delete from public.rooms
  where owner_id is null
    and expires_at is not null
    and expires_at <= timezone('utc', now());

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- realtime for tab content
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_tabs'
    ) then
      alter publication supabase_realtime add table public.room_tabs;
    end if;
  end if;
end;
$$;
