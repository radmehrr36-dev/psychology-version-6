-- Review against the live schema and take a backup before applying.
-- This migration reuses the existing profiles, auth_otps and auth_rate_events.
-- It intentionally does not rerun the earlier migration or backfill verification.
begin;

do $$
declare required text;
begin
  if to_regclass('public.profiles') is null or to_regclass('public.auth_otps') is null
     or to_regclass('public.auth_rate_events') is null then
    raise exception 'Required existing auth tables are missing; inspect the live migration history first';
  end if;
  foreach required in array array['username','phone','account_kind','account_status','contact_verified_at','phone_verified_at'] loop
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name=required) then
      raise exception 'Required profiles column is missing: %', required;
    end if;
  end loop;
end $$;

-- Normalize at the database boundary too, including legacy formats in the unique index.
create or replace function public.normalize_phone_identity(p_value text)
returns text language plpgsql immutable strict set search_path = '' as $$
declare v text;
begin
  v := pg_catalog.regexp_replace(pg_catalog.translate(p_value, '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '[[:space:]()\-]', '', 'g');
  if v ~ '^\+98' then v := '0' || pg_catalog.substr(v, 4);
  elsif v ~ '^0098' then v := '0' || pg_catalog.substr(v, 5);
  elsif v ~ '^98[0-9]{10}$' then v := '0' || pg_catalog.substr(v, 3);
  elsif v ~ '^9[0-9]{9}$' then v := '0' || v;
  end if;
  if v !~ '^09[0-9]{9}$' then return null; end if;
  return v;
end $$;

create unique index if not exists profiles_normalized_phone_hardening_idx
  on public.profiles (public.normalize_phone_identity(phone)) where phone is not null;
create unique index if not exists profiles_lower_username_hardening_idx
  on public.profiles (lower(username)) where username is not null;

create or replace function public.normalize_profile_identity_hardening()
returns trigger language plpgsql set search_path = '' as $$
declare v_phone text;
begin
  if new.phone is not null and (tg_op = 'INSERT' or new.phone is distinct from old.phone) then
    v_phone := public.normalize_phone_identity(new.phone);
    if v_phone is null then raise exception 'شماره موبایل معتبر نیست' using errcode = '22023'; end if;
    new.phone := v_phone;
  end if;
  if new.username is not null and (tg_op = 'INSERT' or new.username is distinct from old.username) then
    new.username := pg_catalog.lower(pg_catalog.btrim(new.username));
    if new.username !~ '^[a-z][a-z0-9_.]{2,23}$' then
      raise exception 'نام کاربری معتبر نیست' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_normalize_profile_identity_hardening on public.profiles;
create trigger trg_normalize_profile_identity_hardening before insert or update of phone, username on public.profiles
  for each row execute function public.normalize_profile_identity_hardening();

-- Serialize each bucket, so concurrent requests cannot overrun the limit.
create or replace function public.auth_rate_hit(p_bucket text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n bigint;
begin
  if p_bucket is null or length(p_bucket) > 300 or p_limit < 1 or p_limit > 1000
     or p_window_seconds < 1 or p_window_seconds > 172800 then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rate:' || p_bucket, 0));
  select count(*) into n from public.auth_rate_events
    where bucket = p_bucket and created_at > now() - pg_catalog.make_interval(secs => p_window_seconds);
  if n >= p_limit then return false; end if;
  insert into public.auth_rate_events(bucket) values (p_bucket);
  return true;
end $$;
revoke all on function public.auth_rate_hit(text,int,int) from public, anon, authenticated;
grant execute on function public.auth_rate_hit(text,int,int) to service_role;

-- The Edge Function computes the HMAC; neither plaintext OTP nor password is stored.
create or replace function public.auth_issue_registration_otp(p_user_id uuid, p_id uuid, p_destination text, p_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare p public.profiles%rowtype;
begin
  if p_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('otp:' || p_user_id::text, 0));
  select * into p from public.profiles where id = p_user_id for update;
  if not found or p.role is not null or p.contact_verified_at is not null
     or p.account_status = 'suspended' or p.phone is distinct from p_destination then return false; end if;
  if exists (select 1 from public.auth_otps where user_id = p_user_id and created_at > now() - interval '45 seconds') then return false; end if;
  update public.auth_otps set consumed_at = now() where user_id = p_user_id and consumed_at is null;
  insert into public.auth_otps(id,user_id,purpose,destination,code_hash,expires_at)
    values(p_id,p_user_id,'registration',p_destination,p_hash,now() + interval '2 minutes');
  return true;
end $$;
revoke all on function public.auth_issue_registration_otp(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.auth_issue_registration_otp(uuid,uuid,text,text) to service_role;

create or replace function public.auth_consume_registration_otp(p_id uuid, p_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare o public.auth_otps%rowtype; p public.profiles%rowtype;
begin
  if p_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  select * into o from public.auth_otps where id = p_id for update;
  if not found or o.purpose <> 'registration' or o.consumed_at is not null
     or o.expires_at <= now() or o.attempts >= least(o.max_attempts, 5) then return false; end if;
  select * into p from public.profiles where id = o.user_id for update;
  if not found or p.phone is distinct from o.destination or p.contact_verified_at is not null
     or p.role is not null or p.account_status = 'suspended' then return false; end if;
  if o.code_hash is distinct from p_hash then
    update public.auth_otps set attempts = attempts + 1 where id = p_id;
    return false;
  end if;
  update public.auth_otps set consumed_at = now() where id = p_id;
  update public.profiles set phone_verified_at = now(), contact_verified_at = now(),
    account_status = case
      when account_status = 'pending' and account_kind in ('user','psychologist')
        and exists (select 1 from auth.users u where u.id = o.user_id and u.email_confirmed_at is not null)
      then 'active'::public.account_status else account_status end
    where id = o.user_id;
  return true;
end $$;
revoke all on function public.auth_consume_registration_otp(uuid,text) from public, anon, authenticated;
grant execute on function public.auth_consume_registration_otp(uuid,text) to service_role;

-- Email ownership is verified independently by Supabase Auth, never by the phone OTP.
create or replace function public.activate_verified_registration_hardening()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.profiles set account_status = 'active'
      where id = new.id and role is null and account_status = 'pending'
        and account_kind in ('user','psychologist') and phone_verified_at is not null;
  end if;
  return new;
end $$;
drop trigger if exists trg_activate_verified_registration_hardening on auth.users;
create trigger trg_activate_verified_registration_hardening after update of email_confirmed_at on auth.users
  for each row execute function public.activate_verified_registration_hardening();

create or replace function public.account_usable_hardening()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_status = 'active'
    and (p.role is not null or p.contact_verified_at is not null));
$$;
revoke all on function public.account_usable_hardening() from public, anon;
grant execute on function public.account_usable_hardening() to authenticated, service_role;

-- Restrictive policies compose with existing permissive policies; they do not grant new access.
do $$
declare t text;
begin
  foreach t in array array['test_attempts','test_answers','test_results','psychologist_applications','support_messages','support_replies'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists account_usable_hardening on public.%I', t);
      execute format('create policy account_usable_hardening on public.%I as restrictive for all to authenticated using (public.account_usable_hardening()) with check (public.account_usable_hardening())', t);
    end if;
  end loop;
end $$;

drop policy if exists account_usable_profile_update_hardening on public.profiles;
create policy account_usable_profile_update_hardening on public.profiles as restrictive for update to authenticated
  using (public.account_usable_hardening()) with check (public.account_usable_hardening());
drop policy if exists account_usable_psychologist_update_hardening on public.psychologists;
create policy account_usable_psychologist_update_hardening on public.psychologists as restrictive for update to authenticated
  using (public.account_usable_hardening()) with check (public.account_usable_hardening());

-- Existing SECURITY DEFINER test RPCs bypass table RLS: retain their bodies behind guarded wrappers.
do $$
declare spec text[] := array['start_test_attempt(uuid)','save_test_answer(uuid,uuid,uuid[])','complete_test_attempt(uuid)','abandon_test_attempt(uuid)'];
  entry text; oldname text; args text;
begin
  foreach entry in array spec loop
    oldname := pg_catalog.split_part(entry, '(', 1);
    args := pg_catalog.substr(entry, pg_catalog.strpos(entry, '('));
    if pg_catalog.to_regprocedure('public.' || oldname || '_before_auth_hardening' || args) is null then
      if pg_catalog.to_regprocedure('public.' || entry) is null then
        raise exception 'Expected RPC public.% is missing; inspect live schema before migration', entry;
      end if;
      execute format('alter function public.%s rename to %I', entry, oldname || '_before_auth_hardening');
    end if;
    execute format('revoke all on function public.%I%s from public, anon, authenticated', oldname || '_before_auth_hardening', args);
  end loop;
end $$;

create or replace function public.start_test_attempt(p_test_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not public.account_usable_hardening() then raise exception 'حساب فعال و تأییدشده لازم است' using errcode='42501'; end if;
  return public.start_test_attempt_before_auth_hardening(p_test_id);
end $$;
create or replace function public.save_test_answer(p_attempt_id uuid,p_question_id uuid,p_option_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.account_usable_hardening() then raise exception 'حساب فعال و تأییدشده لازم است' using errcode='42501'; end if;
  perform public.save_test_answer_before_auth_hardening(p_attempt_id,p_question_id,p_option_ids);
end $$;
create or replace function public.complete_test_attempt(p_attempt_id uuid) returns public.test_results
language plpgsql security definer set search_path = '' as $$
begin
  if not public.account_usable_hardening() then raise exception 'حساب فعال و تأییدشده لازم است' using errcode='42501'; end if;
  return public.complete_test_attempt_before_auth_hardening(p_attempt_id);
end $$;
create or replace function public.abandon_test_attempt(p_attempt_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.account_usable_hardening() then raise exception 'حساب فعال و تأییدشده لازم است' using errcode='42501'; end if;
  perform public.abandon_test_attempt_before_auth_hardening(p_attempt_id);
end $$;
revoke all on function public.start_test_attempt(uuid), public.save_test_answer(uuid,uuid,uuid[]),
  public.complete_test_attempt(uuid), public.abandon_test_attempt(uuid) from public, anon;
grant execute on function public.start_test_attempt(uuid), public.save_test_answer(uuid,uuid,uuid[]),
  public.complete_test_attempt(uuid), public.abandon_test_attempt(uuid) to authenticated;

-- Support RPCs also run as their owner and therefore need the same guard.
do $$
declare spec text[] := array['support_my_tickets()','support_ticket_get(uuid)','support_create_ticket(text,text,text)','support_user_reply(uuid,text)','support_handoff(uuid)','support_close_ticket(uuid)'];
  entry text; oldname text; args text;
begin
  foreach entry in array spec loop
    oldname := pg_catalog.split_part(entry, '(', 1);
    args := pg_catalog.substr(entry, pg_catalog.strpos(entry, '('));
    if pg_catalog.to_regprocedure('public.' || oldname || '_before_auth_hardening' || args) is null then
      if pg_catalog.to_regprocedure('public.' || entry) is null then raise exception 'Expected support RPC % is missing; inspect live schema first', entry; end if;
      execute format('alter function public.%s rename to %I', entry, oldname || '_before_auth_hardening');
    end if;
    execute format('revoke all on function public.%I%s from public, anon, authenticated', oldname || '_before_auth_hardening', args);
  end loop;
end $$;

create or replace function public.support_my_tickets()
returns table (id uuid,subject text,category text,status public.message_status,priority public.message_priority,channel text,created_at timestamptz,last_reply_at timestamptz,reply_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.account_usable_hardening() then raise exception 'حساب فعال و تأییدشده لازم است' using errcode='42501'; end if;
  return query select * from public.support_my_tickets_before_auth_hardening();
end $$;
create or replace function public.support_ticket_get(p_id uuid)
returns table (id uuid,subject text,body text,category text,status public.message_status,priority public.message_priority,channel text,created_at timestamptz,last_reply_at timestamptz,assigned boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.account_usable_hardening() then raise exception 'حساب فعال و تأییدشده لازم است' using errcode='42501'; end if;
  return query select * from public.support_ticket_get_before_auth_hardening(p_id);
end $$;
create or replace function public.support_create_ticket(p_subject text,p_body text,p_category text default 'general') returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not public.account_usable_hardening() then raise exception 'حساب فعال و تأییدشده لازم است' using errcode='42501'; end if;
  return public.support_create_ticket_before_auth_hardening(p_subject,p_body,p_category);
end $$;
create or replace function public.support_user_reply(p_id uuid,p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not public.account_usable_hardening() then raise exception 'حساب فعال و تأییدشده لازم است' using errcode='42501'; end if;
  return public.support_user_reply_before_auth_hardening(p_id,p_body);
end $$;
create or replace function public.support_handoff(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.account_usable_hardening() then raise exception 'حساب فعال و تأییدشده لازم است' using errcode='42501'; end if;
  perform public.support_handoff_before_auth_hardening(p_id);
end $$;
create or replace function public.support_close_ticket(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.account_usable_hardening() then raise exception 'حساب فعال و تأییدشده لازم است' using errcode='42501'; end if;
  perform public.support_close_ticket_before_auth_hardening(p_id);
end $$;
revoke all on function public.support_my_tickets(),public.support_ticket_get(uuid),public.support_create_ticket(text,text,text),
  public.support_user_reply(uuid,text),public.support_handoff(uuid),public.support_close_ticket(uuid) from public,anon;
grant execute on function public.support_my_tickets(),public.support_ticket_get(uuid),public.support_create_ticket(text,text,text),
  public.support_user_reply(uuid,text),public.support_handoff(uuid),public.support_close_ticket(uuid) to authenticated;

-- Search is a bounded RPC with authorization and literal comparisons, not dynamic SQL.
create or replace function public.admin_search_accounts_hardening(p_search text default '', p_kind text default '', p_status text default '', p_page int default 0, p_page_size int default 10)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; term text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_search, '')));
begin
  if not public.has_permission('users','read') then raise exception 'دسترسی لازم وجود ندارد' using errcode='42501'; end if;
  if length(term) > 100 or p_page < 0 or p_page > 10000 or p_page_size < 1 or p_page_size > 100
     or coalesce(p_kind,'') not in ('','user','psychologist','support_specialist','admin')
     or coalesce(p_status,'') not in ('','active','pending','suspended') then
    raise exception 'فیلتر نامعتبر است' using errcode='22023';
  end if;
  with filtered as (
    select p.id,p.email,p.full_name,p.avatar_url,p.role,p.account_status,p.account_kind,p.username,p.phone,
      p.phone_verified_at,p.contact_verified_at,u.email_confirmed_at as email_verified_at,p.last_seen_at,p.created_at,p.updated_at
    from public.profiles p
    left join auth.users u on u.id = p.id
    where (p_status = '' or p.account_status::text = p_status)
      and (p_kind = '' or (p_kind = 'admin' and p.role is not null)
        or (p_kind <> 'admin' and p.role is null and p.account_kind = p_kind))
      and (term = '' or strpos(lower(coalesce(p.full_name,'')),term) > 0
        or strpos(lower(coalesce(p.email,'')),term) > 0 or strpos(lower(coalesce(p.username,'')),term) > 0
        or strpos(coalesce(p.phone,''),pg_catalog.translate(term,'۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩','01234567890123456789')) > 0
        or strpos(p.id::text,term) > 0)
  ), page as (select * from filtered order by created_at desc,id limit p_page_size offset p_page*p_page_size)
  select jsonb_build_object('total',(select count(*) from filtered), 'items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)) into result;
  return result;
end $$;
revoke all on function public.admin_search_accounts_hardening(text,text,text,int,int) from public, anon;
grant execute on function public.admin_search_accounts_hardening(text,text,text,int,int) to authenticated;

create or replace function public.admin_change_account_hardening(p_user_id uuid, p_kind text default null, p_status text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.profiles%rowtype;
begin
  if not public.has_permission('admins','write') then raise exception 'دسترسی لازم وجود ندارد' using errcode='42501'; end if;
  if p_user_id = auth.uid() then raise exception 'تغییر حساب خود مجاز نیست' using errcode='42501'; end if;
  if (p_kind is null) = (p_status is null) then raise exception 'یک تغییر انتخاب کنید' using errcode='22023'; end if;
  if p_kind is not null and p_kind not in ('user','psychologist','support_specialist') then raise exception 'نوع حساب نامعتبر است' using errcode='22023'; end if;
  if p_status is not null and p_status not in ('active','pending','suspended') then raise exception 'وضعیت نامعتبر است' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('admin-role-change', 0));
  select * into target from public.profiles where id=p_user_id for update;
  if not found then raise exception 'حساب قابل تغییر نیست' using errcode='42501'; end if;
  if target.role is not null and (p_kind is not null or public.current_app_role() <> 'super_admin') then
    raise exception 'فقط مدیر ارشد مجاز به تغییر وضعیت مدیر است' using errcode='42501';
  end if;
  if target.role = 'super_admin' and target.account_status = 'active' and p_status <> 'active'
     and (select count(*) from public.profiles where role='super_admin' and account_status='active') <= 1 then
    raise exception 'آخرین مدیر ارشد فعال را نمی‌توان غیرفعال کرد' using errcode='42501';
  end if;
  if p_status = 'active' and ((target.role is null and target.contact_verified_at is null)
      or not exists (select 1 from auth.users u where u.id = p_user_id and u.email_confirmed_at is not null)) then
    raise exception 'تأیید حساب هنوز کامل نشده است' using errcode='42501';
  end if;
  if p_kind is not null then
    update public.profiles set account_kind=p_kind where id=p_user_id;
    perform public.write_audit('account_kind_change','profiles',p_user_id::text,'success',jsonb_build_object('new_kind',p_kind));
  else
    update public.profiles set account_status=p_status::public.account_status where id=p_user_id;
    perform public.write_audit('account_status_change','profiles',p_user_id::text,'success',jsonb_build_object('new_status',p_status));
  end if;
end $$;
revoke all on function public.admin_change_account_hardening(uuid,text,text) from public, anon;
grant execute on function public.admin_change_account_hardening(uuid,text,text) to authenticated;

create or replace function public.admin_set_account_kind(p_user_id uuid,p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_change_account_hardening(p_user_id,p_kind,null);
end $$;
create or replace function public.admin_set_account_status(p_user_id uuid,p_status public.account_status,p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_change_account_hardening(p_user_id,null,p_status::text);
end $$;
revoke all on function public.admin_set_account_kind(uuid,text), public.admin_set_account_status(uuid,public.account_status,text) from public,anon;
grant execute on function public.admin_set_account_kind(uuid,text), public.admin_set_account_status(uuid,public.account_status,text) to authenticated;

create or replace function public.admin_change_admin_role_hardening(p_user_id uuid,p_role public.app_role default null)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.profiles%rowtype;
begin
  if not public.has_permission('admins','write') then raise exception 'دسترسی لازم وجود ندارد' using errcode='42501'; end if;
  if p_user_id = auth.uid() then raise exception 'تغییر نقش خود مجاز نیست' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('admin-role-change', 0));
  select * into target from public.profiles where id=p_user_id for update;
  if not found then raise exception 'حساب یافت نشد' using errcode='22023'; end if;
  if (target.role = 'super_admin' or p_role = 'super_admin') and public.current_app_role() <> 'super_admin' then
    raise exception 'تغییر مدیر ارشد مجاز نیست' using errcode='42501';
  end if;
  if target.role = 'super_admin' and p_role is distinct from 'super_admin'::public.app_role
     and (select count(*) from public.profiles where role='super_admin' and account_status='active') <= 1 then
    raise exception 'آخرین مدیر ارشد را نمی‌توان تنزل داد' using errcode='42501';
  end if;
  update public.profiles set role=p_role where id=p_user_id;
  perform public.write_audit('admin_role_change','profiles',p_user_id::text,'success',jsonb_build_object('new_role',p_role));
end $$;
revoke all on function public.admin_change_admin_role_hardening(uuid,public.app_role) from public,anon;
grant execute on function public.admin_change_admin_role_hardening(uuid,public.app_role) to authenticated;
revoke all on function public.write_audit(text,text,text,text,jsonb) from public, anon, authenticated;

commit;