alter table public.rooms enable row level security;

drop policy if exists "public can read active rooms" on public.rooms;
create policy "public can read active rooms"
on public.rooms
for select
to anon
using (expires_at > timezone('utc', now()));

drop policy if exists "public can insert active rooms" on public.rooms;
create policy "public can insert active rooms"
on public.rooms
for insert
to anon
with check (
  id ~ '^[A-Za-z]{5}$'
  and expires_at > timezone('utc', now())
  and expires_at <= timezone('utc', now()) + interval '24 hours'
);

drop policy if exists "public can update active rooms" on public.rooms;
create policy "public can update active rooms"
on public.rooms
for update
to anon
using (expires_at > timezone('utc', now()))
with check (expires_at > timezone('utc', now()));
