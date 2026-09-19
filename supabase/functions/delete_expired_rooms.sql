-- Mirrored from migrations/20260919_000003_workspace.sql. The migrations are the source of truth.

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
