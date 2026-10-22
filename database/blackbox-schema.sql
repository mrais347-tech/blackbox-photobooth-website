create table public.blackbox_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.blackbox_admins enable row level security;
revoke all on public.blackbox_admins from anon, authenticated;
grant select on public.blackbox_admins to authenticated;
create policy admin_self on public.blackbox_admins for select to authenticated using(user_id = (select auth.uid()));

create table public.orders (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 is_test boolean not null default true,
 payment_status text not null default 'unpaid' check(payment_status in ('unpaid','paid','failed','refunded')),
 fulfillment_status text not null default 'new' check(fulfillment_status in ('new','printing','shipped','cancelled')),
 customer_name text not null check(char_length(customer_name) between 1 and 120),
 email text not null check(char_length(email) between 3 and 254),
 phone text not null check(char_length(phone) between 6 and 30),
 shipping_address jsonb not null check(jsonb_typeof(shipping_address) = 'object'),
 quantity smallint not null check(quantity between 1 and 10),
 design jsonb not null default '{}' check(jsonb_typeof(design) = 'object'),
 amount_sen integer check(amount_sen >= 0),
 currency text not null default 'MYR' check(currency = 'MYR'),
 payment_reference text unique,
 tracking_number text check(char_length(tracking_number) <= 120),
 check(fulfillment_status not in ('printing','shipped') or payment_status = 'paid')
);
alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;
grant select on public.orders to authenticated;
grant update(fulfillment_status,tracking_number) on public.orders to authenticated;
grant all on public.orders to service_role;
create policy admins_read_orders on public.orders for select to authenticated
 using(exists(select 1 from public.blackbox_admins where user_id = (select auth.uid())));
create policy admins_fulfill_orders on public.orders for update to authenticated
 using(exists(select 1 from public.blackbox_admins where user_id = (select auth.uid())))
 with check(exists(select 1 from public.blackbox_admins where user_id = (select auth.uid())));
create index orders_created_at_idx on public.orders(created_at desc);

create table public.order_assets (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete cascade,
 bucket_id text not null check(bucket_id in ('order-originals','order-renders')),
 object_path text not null,
 created_at timestamptz not null default now(),
 unique(bucket_id,object_path),
 check(split_part(object_path,'/',1) = order_id::text)
);
alter table public.order_assets enable row level security;
revoke all on public.order_assets from anon, authenticated;
grant select on public.order_assets to authenticated;
grant all on public.order_assets to service_role;
create policy admins_read_assets on public.order_assets for select to authenticated
 using(exists(select 1 from public.blackbox_admins where user_id = (select auth.uid())));
create index order_assets_order_id_idx on public.order_assets(order_id);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('order-originals','order-originals',false,15728640,array['image/jpeg','image/png','image/webp']),
 ('order-renders','order-renders',false,20971520,array['image/png','image/jpeg']);
create policy blackbox_admin_download on storage.objects for select to authenticated
 using(bucket_id in ('order-originals','order-renders') and
 exists(select 1 from public.blackbox_admins where user_id = (select auth.uid())));
