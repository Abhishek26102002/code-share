-- Access rules for the workspace feature.
--
-- Reading a room row by id stays open while the room is active, because an
-- anonymous person following a share link has no account to check. That row
-- only carries ciphertext: names, tab titles and content are all encrypted in
-- the browser, and the key lives either in the URL hash or in room_keys, which
-- is readable by the owner and their team alone.

-- ---------------------------------------------------------------------------
-- helpers (security definer so policies never recurse through RLS)
-- ---------------------------------------------------------------------------
create or replace function public.can_access_owner_rooms(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_owner is not null
    and auth.uid() is not null
    and (
      p_owner = auth.uid()
      or exists (
        select 1
        from public.team_members m
        join public.teams t on t.id = m.team_id
        where t.owner_id = p_owner
          and m.user_id = auth.uid()
      )
    );
$$;

create or replace function public.shares_team_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user = auth.uid()
    or exists (
      select 1
      from public.team_members mine
      join public.team_members theirs on theirs.team_id = mine.team_id
      where mine.user_id = auth.uid()
        and theirs.user_id = p_user
    );
$$;

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

create or replace function public.can_read_room(p_room_id text)
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
      and (
        r.expires_at is null
        or r.expires_at > timezone('utc', now())
        or r.owner_id = auth.uid()
      )
  );
$$;

create or replace function public.can_write_room(p_room_id text)
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
      and (r.expires_at is null or r.expires_at > timezone('utc', now()))
  );
$$;

-- ---------------------------------------------------------------------------
-- rooms
-- ---------------------------------------------------------------------------
alter table public.rooms enable row level security;

drop policy if exists "public can read active rooms" on public.rooms;
drop policy if exists "public can insert active rooms" on public.rooms;
drop policy if exists "public can update active rooms" on public.rooms;

drop policy if exists "rooms readable while active or by owner" on public.rooms;
create policy "rooms readable while active or by owner"
on public.rooms
for select
to anon, authenticated
using (
  expires_at is null
  or expires_at > timezone('utc', now())
  or owner_id = auth.uid()
);

drop policy if exists "anonymous rooms expire within a day" on public.rooms;
create policy "anonymous rooms expire within a day"
on public.rooms
for insert
to anon
with check (
  owner_id is null
  and parent_id is null
  and id ~ '^[A-Za-z]{5}$'
  and expires_at is not null
  and expires_at > timezone('utc', now())
  and expires_at <= timezone('utc', now()) + interval '24 hours'
);

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

drop policy if exists "anonymous rooms stay editable while active" on public.rooms;
create policy "anonymous rooms stay editable while active"
on public.rooms
for update
to anon, authenticated
using (owner_id is null and expires_at > timezone('utc', now()))
with check (owner_id is null and expires_at > timezone('utc', now()));

drop policy if exists "owners manage their rooms" on public.rooms;
create policy "owners manage their rooms"
on public.rooms
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "owners delete their rooms" on public.rooms;
create policy "owners delete their rooms"
on public.rooms
for delete
to authenticated
using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- room_tabs
-- ---------------------------------------------------------------------------
alter table public.room_tabs enable row level security;

drop policy if exists "tabs follow room read access" on public.room_tabs;
create policy "tabs follow room read access"
on public.room_tabs
for select
to anon, authenticated
using (public.can_read_room(room_id));

drop policy if exists "tabs are editable while the room is active" on public.room_tabs;
create policy "tabs are editable while the room is active"
on public.room_tabs
for insert
to anon, authenticated
with check (public.can_write_room(room_id));

drop policy if exists "tabs update while the room is active" on public.room_tabs;
create policy "tabs update while the room is active"
on public.room_tabs
for update
to anon, authenticated
using (public.can_write_room(room_id))
with check (public.can_write_room(room_id));

drop policy if exists "tabs delete while the room is active" on public.room_tabs;
create policy "tabs delete while the room is active"
on public.room_tabs
for delete
to anon, authenticated
using (public.can_write_room(room_id));

-- ---------------------------------------------------------------------------
-- room_keys: owner and accepted team members only
-- ---------------------------------------------------------------------------
alter table public.room_keys enable row level security;

drop policy if exists "room keys readable by owner and team" on public.room_keys;
create policy "room keys readable by owner and team"
on public.room_keys
for select
to authenticated
using (
  exists (
    select 1 from public.rooms r
    where r.id = room_id
      and public.can_access_owner_rooms(r.owner_id)
  )
);

drop policy if exists "room keys written by the room owner" on public.room_keys;
create policy "room keys written by the room owner"
on public.room_keys
for insert
to authenticated
with check (
  exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = auth.uid())
);

drop policy if exists "room keys deleted by the room owner" on public.room_keys;
create policy "room keys deleted by the room owner"
on public.room_keys
for delete
to authenticated
using (
  exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles readable inside a team" on public.profiles;
create policy "profiles readable inside a team"
on public.profiles
for select
to authenticated
using (public.shares_team_with(id));

drop policy if exists "profiles updated by their owner" on public.profiles;
create policy "profiles updated by their owner"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------
alter table public.teams enable row level security;

drop policy if exists "teams readable by owner and members" on public.teams;
create policy "teams readable by owner and members"
on public.teams
for select
to authenticated
using (owner_id = auth.uid() or public.is_team_member(id));

drop policy if exists "teams created by their owner" on public.teams;
create policy "teams created by their owner"
on public.teams
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "teams renamed by their owner" on public.teams;
create policy "teams renamed by their owner"
on public.teams
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

alter table public.team_members enable row level security;

drop policy if exists "members readable by the team" on public.team_members;
create policy "members readable by the team"
on public.team_members
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid())
);

drop policy if exists "owner removes members, members leave" on public.team_members;
create policy "owner removes members, members leave"
on public.team_members
for delete
to authenticated
using (
  user_id = auth.uid()
  or exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid())
);

alter table public.team_invites enable row level security;

drop policy if exists "invites readable by sender and recipient" on public.team_invites;
create policy "invites readable by sender and recipient"
on public.team_invites
for select
to authenticated
using (
  invited_by = auth.uid()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- account deletion requests
-- ---------------------------------------------------------------------------
alter table public.account_deletion_requests enable row level security;

drop policy if exists "deletion requests belong to one account" on public.account_deletion_requests;
create policy "deletion requests belong to one account"
on public.account_deletion_requests
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "accounts request their own deletion" on public.account_deletion_requests;
create policy "accounts request their own deletion"
on public.account_deletion_requests
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "accounts cancel their own request" on public.account_deletion_requests;
create policy "accounts cancel their own request"
on public.account_deletion_requests
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- team RPCs: writes that policies alone cannot express safely
-- ---------------------------------------------------------------------------
create or replace function public.ensure_team()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select t.id into v_team_id from public.teams t where t.owner_id = auth.uid();

  if v_team_id is null then
    insert into public.teams (owner_id) values (auth.uid()) returning id into v_team_id;
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (v_team_id, auth.uid(), 'owner')
  on conflict (team_id, user_id) do nothing;

  return v_team_id;
end;
$$;

create or replace function public.invite_team_member(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_invite_id uuid;
  normalized text := lower(trim(p_email));
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  if normalized !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'that does not look like an email address';
  end if;

  if normalized = lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'you are already on this team';
  end if;

  v_team_id := public.ensure_team();

  if exists (
    select 1
    from public.team_members m
    join public.profiles p on p.id = m.user_id
    where m.team_id = v_team_id and lower(p.email) = normalized
  ) then
    raise exception 'that person is already on this team';
  end if;

  insert into public.team_invites (team_id, email, invited_by)
  values (v_team_id, normalized, auth.uid())
  on conflict do nothing
  returning id into v_invite_id;

  if v_invite_id is null then
    select i.id into v_invite_id
    from public.team_invites i
    where i.team_id = v_team_id and lower(i.email) = normalized and i.status = 'pending';
  end if;

  return v_invite_id;
end;
$$;

create or replace function public.respond_team_invite(p_invite_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.team_invites;
  viewer_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select * into invite from public.team_invites where id = p_invite_id;

  if invite.id is null then
    raise exception 'invite not found';
  end if;

  if lower(invite.email) <> viewer_email then
    raise exception 'this invite belongs to somebody else';
  end if;

  if invite.status <> 'pending' then
    return invite.status;
  end if;

  if p_accept then
    insert into public.team_members (team_id, user_id, role)
    values (invite.team_id, auth.uid(), 'member')
    on conflict (team_id, user_id) do nothing;
  end if;

  update public.team_invites
  set status = case when p_accept then 'accepted' else 'rejected' end,
      responded_at = timezone('utc', now())
  where id = p_invite_id;

  return case when p_accept then 'accepted' else 'rejected' end;
end;
$$;

create or replace function public.revoke_team_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.team_invites i
  set status = 'revoked', responded_at = timezone('utc', now())
  where i.id = p_invite_id
    and i.status = 'pending'
    and exists (select 1 from public.teams t where t.id = i.team_id and t.owner_id = auth.uid());
end;
$$;

create or replace function public.request_account_deletion(p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select id into request_id
  from public.account_deletion_requests
  where user_id = auth.uid() and status = 'pending';

  if request_id is not null then
    return request_id;
  end if;

  insert into public.account_deletion_requests (user_id, reason)
  values (auth.uid(), nullif(trim(coalesce(p_reason, '')), ''))
  returning id into request_id;

  return request_id;
end;
$$;

grant execute on function public.owns_room(text) to anon, authenticated;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.ensure_team() to authenticated;
grant execute on function public.invite_team_member(text) to authenticated;
grant execute on function public.respond_team_invite(uuid, boolean) to authenticated;
grant execute on function public.revoke_team_invite(uuid) to authenticated;
grant execute on function public.request_account_deletion(text) to authenticated;
