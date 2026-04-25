# Supabase Backend Layout

This folder keeps the database and operational pieces separate from the Next.js frontend.

## Structure

- `schema/`: canonical table definitions
- `functions/`: SQL helper functions and cron helpers
- `edgefunctions/`: optional Supabase Edge Functions
- `migrations/`: ordered SQL migrations
- `RLS/`: row level security policies

## Expiry model

- Rooms are created with `expires_at = now() + interval '24 hours'`
- RLS blocks reads and writes after expiry
- Cleanup can run on a schedule through `pg_cron`
- An Edge Function is included if you prefer HTTP-triggered cleanup

## Recommended setup

1. Run the SQL in `migrations/`
2. Enable Realtime for `public.rooms`
3. Schedule cleanup with:

```sql
select cron.schedule(
  'delete-expired-rooms-hourly',
  '0 * * * *',
  $$select public.delete_expired_rooms();$$
);
```
