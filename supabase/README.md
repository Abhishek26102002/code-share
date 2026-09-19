# Supabase Backend Layout

This folder keeps the database and operational pieces separate from the Next.js frontend.

## Structure

- `schema/`: canonical table definitions
- `functions/`: SQL helper functions, RPCs and cron helpers
- `edgefunctions/`: optional Supabase Edge Functions
- `migrations/`: ordered SQL migrations (the source of truth)
- `RLS/`: row level security policies

## Data model

```
rooms          id, owner_id, parent_id, encrypted_name, expires_at
  └─ rooms     a subroom: parent_id points at a top-level room (one level only)
       └─ room_tabs   encrypted_title, encrypted_content, position
room_keys      the AES key of an account room, readable by owner + team
teams / team_members / team_invites
profiles       email mirror of auth.users, readable inside a team
```

Everything a person can read - room names, tab titles, tab content - is
encrypted in the browser before it is sent. Anonymous rooms keep the key in the
URL hash only, so the server never sees it. Account rooms additionally store the
key in `room_keys` so the owner and their team can open a room from the sidebar;
that row is the one piece of data an operator with database access could use to
decrypt a room.

## Expiry model

- Anonymous rooms: `expires_at = now() + 24 hours`, enforced by RLS, deleted by cron
- Account rooms: the owner picks 24 hours, 7 days, 30 days or never (`expires_at is null`)
- An expired account room stays in the database and is visible to its owner only,
  who can reactivate it or delete it
- `delete_expired_rooms()` only removes anonymous rooms

## Recommended setup

1. Run the SQL in `migrations/` in filename order
2. Enable Realtime for `public.rooms` and `public.room_tabs`
3. Enable Email auth in Authentication -> Providers
4. Schedule cleanup with:

```sql
select cron.schedule(
  'delete-expired-rooms-hourly',
  '0 * * * *',
  $$select public.delete_expired_rooms();$$
);
```

## Account deletion

`request_account_deletion(reason)` records a row in
`account_deletion_requests`. Deleting the auth user itself needs the service
role, so complete the request from the dashboard or a trusted job; removing the
user cascades to their rooms, tabs, keys and team rows.
