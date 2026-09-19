# Code Share

Minimal real-time code sharing built with Next.js, TypeScript, Supabase, and client-side encryption.

## What it does

### Without an account

- Creates a short 5-letter room URL for every session
- Adds a compact private key in the URL hash for browser-side encryption
- Lets two developers edit the same room through the link, across multiple tabs
- Syncs changes in real time through Supabase Realtime
- Debounces writes to 3 seconds and flushes on tab hide/page leave
- Expires the room after 24 hours

### With an account (optional)

- A workspace at `/workspace` with a sidebar of rooms, subrooms and tabs
- Rooms nest one level: a room holds subrooms, and every room holds tabs
- Each room has its own id, so sharing one room shares that room and its tabs
  only - never the rest of the workspace
- Expiry is per room: never (the default), 24 hours, 7 days or 30 days
- An expired room stays visible to its owner, who can reactivate or delete it
- Teams: invite a colleague by email, they accept in their own Teams tab, and
  they can then open every room you own
- Settings: change password, switch theme, request account deletion

## Encryption model

Everything a person can read - room names, tab titles, tab content - is
encrypted in the browser with AES-GCM before it is sent.

- Link-only rooms: the key exists only in the URL fragment. The server never
  sees it.
- Account rooms: the key is also stored in `room_keys`, so the owner and their
  team can open a room from the sidebar without a link. That row is readable by
  the owner and accepted team members only, and it is the one piece of data an
  operator with database access could use to decrypt a room.

Room rows stay readable by id while the room is active, because someone
following a share link has no account to check. Those rows carry ciphertext
only.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local` and add your Supabase values.

3. Run the SQL files under `supabase/migrations/` in order.

4. Enable Realtime for the `rooms` and `room_tabs` tables from the Supabase
   dashboard, and enable the Email provider under Authentication.

5. Run the app:

```bash
npm run dev
```

## Notes

- The `#fragment` part of the room URL acts as the private key and is not sent to the server.
- Anonymous rooms are removed after expiry through RLS plus a `pg_cron` job;
  account rooms are never deleted automatically.
- The backend SQL and ops files live under `supabase/`.
- Account deletion is recorded as a request: removing the auth user needs the
  service role, and that cascades to their rooms, tabs, keys and team rows.
- This is still an MVP and not a replacement for a fully audited end-to-end collaboration product.
