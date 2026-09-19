-- Two policies compared a column of the outer row against a subquery table
-- that happens to carry a column of the same name, so the inner name won:
--
--   rooms insert: "p.id = parent_id" resolved to p.parent_id, so no subroom
--                 could ever be created.
--   teams select: "m.team_id = id" resolved to team_members.id, so a member
--                 could not read the team they had joined.
--
-- Passing the value into a function removes the ambiguity: a parameter cannot
-- be shadowed by a table column.

create or replace function public.owns_room(p_room_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rooms r
    where r.id = p_room_id
      and r.owner_id = auth.uid()
  );
$$;

create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members m
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
  );
$$;

drop policy if exists "accounts create their own rooms" on public.rooms;
create policy "accounts create their own rooms"
on public.rooms
for insert
to authenticated
with check (
  id ~ '^[A-Za-z]{5}$'
  and (
    (owner_id = auth.uid() and (parent_id is null or public.owns_room(parent_id)))
    or (
      owner_id is null
      and parent_id is null
      and expires_at is not null
      and expires_at <= timezone('utc', now()) + interval '24 hours'
    )
  )
);

drop policy if exists "teams readable by owner and members" on public.teams;
create policy "teams readable by owner and members"
on public.teams
for select
to authenticated
using (owner_id = auth.uid() or public.is_team_member(id));

grant execute on function public.owns_room(text) to anon, authenticated;
grant execute on function public.is_team_member(uuid) to authenticated;
