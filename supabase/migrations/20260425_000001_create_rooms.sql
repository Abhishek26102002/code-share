create extension if not exists pgcrypto;
create extension if not exists pg_cron;

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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists rooms_set_updated_at on public.rooms;

create trigger rooms_set_updated_at
before update on public.rooms
for each row
execute function public.set_updated_at();

create or replace function public.delete_expired_rooms()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.rooms
  where expires_at <= timezone('utc', now());

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
