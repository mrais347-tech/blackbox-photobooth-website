-- Applied separately after blackbox-schema.sql. Preview-only capacity is deliberate.
create table public.test_upload_sessions (
 id uuid primary key,
 token_hash text not null check(length(token_hash)=64),
 ip_hash text not null check(length(ip_hash)=64),
 payload jsonb not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '2 hours',
 completed_at timestamptz
);
alter table public.test_upload_sessions enable row level security;
revoke all on public.test_upload_sessions from anon,authenticated;
grant all on public.test_upload_sessions to service_role;
create policy test_sessions_service_only on public.test_upload_sessions for all to service_role using(true) with check(true);
create index test_upload_created_idx on public.test_upload_sessions(created_at);

create function public.begin_test_upload(p_id uuid,p_hash text,p_ip text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare existing public.test_upload_sessions;
begin
 perform pg_advisory_xact_lock(87432519);
 select * into existing from public.test_upload_sessions where id=p_id;
 if found then
  if existing.token_hash<>p_hash then raise exception 'invalid_session'; end if;
  if existing.completed_at is not null then return jsonb_build_object('complete',true); end if;
  if existing.expires_at<now() then raise exception 'session_expired'; end if;
  if existing.payload<>p_payload then raise exception 'session_changed'; end if;
  return jsonb_build_object('complete',false);
 end if;
 if (select count(*) from public.test_upload_sessions)>=10 then raise exception 'preview_capacity'; end if;
 if (select count(*) from public.test_upload_sessions where ip_hash=p_ip and created_at>now()-interval '1 hour')>=3 then raise exception 'preview_rate_limit'; end if;
 insert into public.test_upload_sessions(id,token_hash,ip_hash,payload) values(p_id,p_hash,p_ip,p_payload);
 return jsonb_build_object('complete',false);
end $$;
revoke all on function public.begin_test_upload(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.begin_test_upload(uuid,text,text,jsonb) to service_role;

create function public.complete_test_upload(p_id uuid,p_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.test_upload_sessions;
begin
 select * into s from public.test_upload_sessions where id=p_id for update;
 if not found or s.token_hash<>p_hash then raise exception 'invalid_session'; end if;
 if s.completed_at is not null then return jsonb_build_object('orderId',p_id,'isTest',true); end if;
 if s.expires_at<now() then raise exception 'session_expired'; end if;
 if (select count(*) from storage.objects where
  (bucket_id='order-originals' and name in (p_id||'/photo-1.jpg',p_id||'/photo-2.jpg',p_id||'/photo-3.jpg')) or
  (bucket_id='order-renders' and name=p_id||'/preview.png'))<>4 then raise exception 'uploads_incomplete'; end if;
 insert into public.orders(id,is_test,payment_status,customer_name,email,phone,shipping_address,quantity,design)
 values(p_id,true,'unpaid',s.payload->>'name',s.payload->>'email',s.payload->>'phone',s.payload->'address',(s.payload->>'quantity')::smallint,s.payload->'design');
 insert into public.order_assets(order_id,bucket_id,object_path) values
 (p_id,'order-originals',p_id||'/photo-1.jpg'),(p_id,'order-originals',p_id||'/photo-2.jpg'),
 (p_id,'order-originals',p_id||'/photo-3.jpg'),(p_id,'order-renders',p_id||'/preview.png');
 update public.test_upload_sessions set completed_at=now() where id=p_id;
 return jsonb_build_object('orderId',p_id,'isTest',true);
end $$;
revoke all on function public.complete_test_upload(uuid,text) from public,anon,authenticated;
grant execute on function public.complete_test_upload(uuid,text) to service_role;
update storage.buckets set file_size_limit=8388608 where id='order-originals';
update storage.buckets set file_size_limit=5242880 where id='order-renders';
