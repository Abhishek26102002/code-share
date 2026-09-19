-- Mirrored from migrations/20260919_000004_workspace_rls.sql. The migrations are the source of truth.

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

grant execute on function public.ensure_team() to authenticated;
grant execute on function public.invite_team_member(text) to authenticated;
grant execute on function public.respond_team_invite(uuid, boolean) to authenticated;
grant execute on function public.revoke_team_invite(uuid) to authenticated;
grant execute on function public.request_account_deletion(text) to authenticated;
