# Code Share

Minimal real-time code sharing built with Next.js, TypeScript, Supabase, and client-side encryption.

## What it does

- Creates a short 5-letter room URL for every session
- Adds a compact private key in the URL hash for browser-side encryption
- Lets two developers edit code through the same link
- Syncs changes in real time through Supabase Realtime
- Debounces writes to 3 seconds and flushes on tab hide/page leave
- Expires every room after 24 hours

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local` and add your Supabase values.

3. Run the SQL files under `supabase/migrations/` in order.

4. Enable Realtime for the `rooms` table from the Supabase dashboard.

5. Run the app:

```bash
npm run dev
```

## Notes

- The `#fragment` part of the room URL acts as the private key and is not sent to the server.
- Room access is blocked after expiry through RLS, and cleanup can run with `pg_cron`.
- The backend SQL and ops files live under `supabase/`.
- This is still an MVP and not a replacement for a fully audited end-to-end collaboration product.
