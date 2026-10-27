alter table public.orders add column courier text check(length(courier)<=80), add column updated_at timestamptz not null default now(), add column version integer not null default 1;
alter table public.orders drop constraint orders_fulfillment_status_check;
alter table public.orders add constraint orders_fulfillment_status_check check(fulfillment_status in ('new','printing','ready_to_ship','shipped','cancelled'));
alter table public.orders drop constraint orders_check;
alter table public.orders add constraint orders_paid_before_fulfillment check(fulfillment_status not in ('printing','ready_to_ship','shipped') or payment_status='paid');
alter table public.orders add constraint orders_shipment_details check(fulfillment_status<>'shipped' or (length(trim(courier))>0 and length(trim(tracking_number))>0 and courier is not null and tracking_number is not null));
grant update(courier) on public.orders to authenticated;
create table public.order_notes(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),body text not null check(length(trim(body)) between 1 and 2000),created_by uuid not null default auth.uid(),created_at timestamptz not null default now());
alter table public.order_notes enable row level security;
revoke all on public.order_notes from anon,authenticated;
grant select on public.order_notes to authenticated;
grant insert(id,order_id,body) on public.order_notes to authenticated;
create policy staff_read_notes on public.order_notes for select to authenticated using(exists(select 1 from public.blackbox_admins where user_id=(select auth.uid())));
create policy staff_add_notes on public.order_notes for insert to authenticated with check(created_by=(select auth.uid()) and exists(select 1 from public.blackbox_admins where user_id=(select auth.uid())));
create index order_notes_order_idx on public.order_notes(order_id,created_at desc);
create table public.order_history(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id),actor_id uuid,created_at timestamptz not null default now(),changes jsonb not null);
alter table public.order_history enable row level security;
revoke all on public.order_history from anon,authenticated;
grant select on public.order_history to authenticated;
create policy staff_read_history on public.order_history for select to authenticated using(exists(select 1 from public.blackbox_admins where user_id=(select auth.uid())));
create index order_history_order_idx on public.order_history(order_id,created_at desc);
create schema if not exists blackbox_private;
revoke all on schema blackbox_private from public,anon,authenticated;
create function blackbox_private.order_version() returns trigger language plpgsql security invoker set search_path='' as $$ begin new.version=old.version+1;new.updated_at=now();return new;end $$;
revoke all on function blackbox_private.order_version() from public,anon,authenticated;
create trigger order_version_before_update before update on public.orders for each row execute function blackbox_private.order_version();
-- A locked-down trigger writes history. Clients have no INSERT/UPDATE/DELETE grant on history.
create function blackbox_private.order_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare changes jsonb='{}'; k text; previous jsonb=to_jsonb(old); following jsonb=to_jsonb(new); actor uuid=auth.uid();
begin
 if actor is not null and not exists(select 1 from public.blackbox_admins where user_id=actor) then raise exception 'Staff access required';end if;
 foreach k in array array['fulfillment_status','tracking_number','courier','payment_status'] loop
 if previous->k is distinct from following->k then changes=changes||jsonb_build_object(k,jsonb_build_object('from',previous->k,'to',following->k));end if;
 end loop;
 if changes<>'{}'::jsonb then insert into public.order_history(order_id,actor_id,changes) values(new.id,actor,changes);end if;
 return new;
end $$;
revoke all on function blackbox_private.order_audit() from public,anon,authenticated;
create trigger order_audit_after_update after update on public.orders for each row execute function blackbox_private.order_audit();
