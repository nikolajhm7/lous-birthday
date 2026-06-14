create extension if not exists "pgcrypto";

create table if not exists public.drinks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_url text,
  low_stock boolean not null default false,
  price_dkk integer not null check (price_dkk >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.drinks add column if not exists image_url text;
alter table public.drinks add column if not exists low_stock boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum ('new', 'in_progress', 'ready', 'delivered');
  end if;
end $$;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_group_id uuid not null default gen_random_uuid(),
  guest_name text not null,
  drink_id uuid not null references public.drinks(id),
  quantity integer not null default 1 check (quantity >= 1),
  note text,
  status public.order_status not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.orders add column if not exists order_group_id uuid not null default gen_random_uuid();

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  guest_name text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.orders;
  exception
    when duplicate_object then
      null;
  end;

  begin
    alter publication supabase_realtime add table public.drinks;
  exception
    when duplicate_object then
      null;
  end;
end $$;

alter table public.drinks enable row level security;
alter table public.orders enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "Public can read drinks" on public.drinks;
create policy "Public can read drinks"
on public.drinks
for select
to anon, authenticated
using (true);

drop policy if exists "Public can insert drinks" on public.drinks;
create policy "Public can insert drinks"
on public.drinks
for insert
to anon, authenticated
with check (true);

drop policy if exists "Public can update drinks" on public.drinks;
create policy "Public can update drinks"
on public.drinks
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Public can delete drinks" on public.drinks;
create policy "Public can delete drinks"
on public.drinks
for delete
to anon, authenticated
using (true);

insert into storage.buckets (id, name, public)
values ('drink-images', 'drink-images', true)
on conflict (id) do nothing;

drop policy if exists "Public can read drink images" on storage.objects;
create policy "Public can read drink images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'drink-images');

drop policy if exists "Public can upload drink images" on storage.objects;
create policy "Public can upload drink images"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'drink-images');

drop policy if exists "Public can update drink images" on storage.objects;
create policy "Public can update drink images"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'drink-images')
with check (bucket_id = 'drink-images');

drop policy if exists "Public can delete drink images" on storage.objects;
create policy "Public can delete drink images"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'drink-images');

drop policy if exists "Public can insert orders" on public.orders;
create policy "Public can insert orders"
on public.orders
for insert
to anon, authenticated
with check (true);

drop policy if exists "Public can read orders" on public.orders;
create policy "Public can read orders"
on public.orders
for select
to anon, authenticated
using (true);

drop policy if exists "Public can update order status" on public.orders;
create policy "Public can update order status"
on public.orders
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Public can insert push subscriptions" on public.push_subscriptions;
create policy "Public can insert push subscriptions"
on public.push_subscriptions
for insert
to anon, authenticated
with check (true);

drop policy if exists "Public can read push subscriptions" on public.push_subscriptions;
create policy "Public can read push subscriptions"
on public.push_subscriptions
for select
to anon, authenticated
using (true);

drop policy if exists "Public can update push subscriptions" on public.push_subscriptions;
create policy "Public can update push subscriptions"
on public.push_subscriptions
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Public can delete push subscriptions" on public.push_subscriptions;
create policy "Public can delete push subscriptions"
on public.push_subscriptions
for delete
to anon, authenticated
using (true);

insert into public.drinks (name, description, price_dkk)
values
  ('Aperol Spritz', 'Frisk og let bitter med bobler', 65),
  ('Espresso Martini', 'Kaffe, vodka og sødme', 75),
  ('Mojito', 'Mynte, lime og rom', 70)
on conflict do nothing;
