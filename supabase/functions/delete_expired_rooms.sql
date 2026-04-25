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
