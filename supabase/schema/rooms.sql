create extension if not exists pgcrypto;

-- A room holds no content of its own: its documents live in public.room_tabs.
-- encrypted_name is ciphertext produced in the browser, like everything else
-- a person can read. expires_at null means "never" and is only allowed on
-- rooms that belong to an account.
create table if not exists public.rooms (
  id text primary key,
  owner_id uuid references auth.users (id) on delete cascade,
  parent_id text references public.rooms (id) on delete cascade,
  encrypted_name text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz default timezone('utc', now()) + interval '24 hours',
  constraint rooms_id_letters_only check (id ~ '^[A-Za-z]{5}$'),
  constraint rooms_expiry_window check (expires_at is null or expires_at > created_at),
  constraint rooms_anonymous_expiry check (owner_id is not null or expires_at is not null)
);

create index if not exists rooms_expires_at_idx on public.rooms (expires_at);
create index if not exists rooms_owner_id_idx on public.rooms (owner_id);
create index if not exists rooms_parent_id_idx on public.rooms (parent_id);
