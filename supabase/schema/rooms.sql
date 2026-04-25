create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id text primary key,
  encrypted_content text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default timezone('utc', now()) + interval '24 hours',
  constraint rooms_id_letters_only check (id ~ '^[A-Za-z]{5}$'),
  constraint rooms_expiry_window check (
    expires_at > created_at
    and expires_at <= created_at + interval '24 hours'
  )
);

create index if not exists rooms_expires_at_idx on public.rooms (expires_at);
