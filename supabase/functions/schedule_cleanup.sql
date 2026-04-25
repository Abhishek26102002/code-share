create extension if not exists pg_cron;

select cron.schedule(
  'delete-expired-rooms-hourly',
  '0 * * * *',
  $$select public.delete_expired_rooms();$$
)
where not exists (
  select 1 from cron.job where jobname = 'delete-expired-rooms-hourly'
);
