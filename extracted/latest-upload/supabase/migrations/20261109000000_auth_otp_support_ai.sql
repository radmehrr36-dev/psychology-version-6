-- ============================================================
-- آریاسازه — ثبت‌نام با OTP، سه نوع حساب عمومی، گفت‌وگوی دوطرفه‌ی پشتیبانی، AI پشتیبانی
--
-- مهم (سازگاری):
--   • این migration مستقل است و migrationهای قبلی را بازنویسی نمی‌کند.
--   • هر دستور idempotent است (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS)
--     تا اگر بخشی از آن در migrationهای 20261108000001..5 وجود داشته باشد، خطا ندهد.
--   • توابع/triggerهای موجودِ guard_* را جایگزین نمی‌کند؛ guardهای جدید با نام مستقل اضافه می‌شوند.
--   • فقط handle_new_user بازنویسی می‌شود (برای پذیرش support_specialist) — قبل از اجرا بررسی کنید که
--     migrationهای 20261108* آن را تغییر نداده باشند.
-- وابستگی: 20260105000000_accounts_navigation_test_flow.sql
-- ============================================================
begin;

-- ── ۱) پروفایل: نام کاربری، موبایل، تأیید هویت تماس، نوع حساب سوم ─────────────
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists phone_verified_at timestamptz;
alter table public.profiles add column if not exists contact_verified_at timestamptz;

-- نوع حساب: user | psychologist | support_specialist (مدیر ارشد همچنان با profiles.role تعیین می‌شود)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%account_kind%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
  alter table public.profiles
    add constraint profiles_account_kind_check
    check (account_kind in ('user','psychologist','support_specialist'));
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_format') then
    alter table public.profiles add constraint profiles_username_format
      check (username is null or username ~ '^[a-z][a-z0-9_.]{2,23}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_phone_format') then
    alter table public.profiles add constraint profiles_phone_format
      check (phone is null or phone ~ '^09[0-9]{9}$');
  end if;
end $$;

create unique index if not exists profiles_username_key on public.profiles (lower(username)) where username is not null;
create unique index if not exists profiles_phone_key on public.profiles (phone) where phone is not null;

-- حساب‌های موجود (از جمله مدیران ارشد) تأییدشده تلقی می‌شوند؛ فقط ثبت‌نام‌های جدید نیازمند OTP هستند
update public.profiles set contact_verified_at = coalesce(contact_verified_at, created_at) where contact_verified_at is null;

-- ثبت‌نام: نوع حساب از metadata فقط از میان سه مقدار مجاز خوانده می‌شود؛ نقش مدیریتی هرگز.
-- متخصص پشتیبان تا تأیید مدیر در وضعیت pending می‌ماند.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_kind text := 'user';
  v_status account_status := 'active';
begin
  case coalesce(new.raw_user_meta_data->>'account_kind', '')
    when 'psychologist' then v_kind := 'psychologist';
    when 'support_specialist' then v_kind := 'support_specialist'; v_status := 'pending';
    else v_kind := 'user';
  end case;
  insert into public.profiles (id, email, full_name, role, account_status, account_kind, contact_verified_at)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), null, v_status, v_kind, null)
  on conflict (id) do nothing;
  return new;
end $$;

-- کاربر نمی‌تواند مشخصات هویتی/وضعیت تأیید خود را مستقیم تغییر دهد (guard مستقل از guardهای قبلی)
create or replace function public.guard_profile_identity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;                 -- service_role / اسکریپت‌های سرور
  if public.has_permission('admins', 'write') then return new; end if;
  if new.username is distinct from old.username
     or new.phone is distinct from old.phone
     or new.phone_verified_at is distinct from old.phone_verified_at
     or new.contact_verified_at is distinct from old.contact_verified_at then
    raise exception 'تغییر مشخصات هویتی از این مسیر مجاز نیست' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_profile_identity_guard on public.profiles;
create trigger trg_profile_identity_guard before update on public.profiles
  for each row execute function public.guard_profile_identity();

-- تغییر نوع حساب فقط توسط مدیر دارای مجوز (admins.write)
create or replace function public.admin_set_account_kind(p_user_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('admins', 'write') then
    raise exception 'دسترسی لازم برای تغییر نوع حساب وجود ندارد' using errcode = '42501';
  end if;
  if p_kind not in ('user','psychologist','support_specialist') then
    raise exception 'نوع حساب نامعتبر است' using errcode = '22023';
  end if;
  update public.profiles set account_kind = p_kind where id = p_user_id;
end $$;
revoke all on function public.admin_set_account_kind(uuid, text) from public, anon;
grant execute on function public.admin_set_account_kind(uuid, text) to authenticated;

-- ── ۲) OTP ثبت‌نام و محدودسازی نرخ (فقط از Edge Function با service_role) ───────
create table if not exists public.auth_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null default 'registration' check (purpose in ('registration')),
  destination text not null,
  code_hash text not null,               -- HMAC کد؛ خودِ کد هرگز ذخیره نمی‌شود
  attempts int not null default 0,
  max_attempts int not null default 5,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists auth_otps_user_idx on public.auth_otps (user_id, created_at desc);
alter table public.auth_otps enable row level security;
revoke all on public.auth_otps from anon, authenticated;     -- بدون policy: فقط service_role

create table if not exists public.auth_rate_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_rate_events_bucket_idx on public.auth_rate_events (bucket, created_at desc);
alter table public.auth_rate_events enable row level security;
revoke all on public.auth_rate_events from anon, authenticated;

create or replace function public.auth_rate_hit(p_bucket text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if random() < 0.02 then
    delete from public.auth_rate_events where created_at < now() - interval '2 days';
  end if;
  select count(*) into n from public.auth_rate_events
   where bucket = p_bucket and created_at > now() - make_interval(secs => p_window_seconds);
  if n >= p_limit then return false; end if;
  insert into public.auth_rate_events (bucket) values (p_bucket);
  return true;
end $$;
revoke all on function public.auth_rate_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.auth_rate_hit(text, int, int) to service_role;

-- ── ۳) پشتیبانی: کانال (تیکت/AI)، نوع نویسنده، توابع کمکی ─────────────────────
alter table public.support_messages
  add column if not exists channel text not null default 'ticket' check (channel in ('ticket','ai'));
alter table public.support_replies
  add column if not exists author_kind text not null default 'staff' check (author_kind in ('user','staff','ai','system'));
alter table public.support_replies add column if not exists author_name text;
create index if not exists support_replies_message_idx on public.support_replies (message_id, created_at);
create index if not exists support_messages_requester_idx on public.support_messages (requester_id, created_at desc);

create or replace function public.is_support_specialist()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.account_kind = 'support_specialist' and p.account_status = 'active'
  );
$$;

create or replace function public.owns_ticket(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.support_messages m where m.id = p_id and m.requester_id = auth.uid());
$$;

create or replace function public.specialist_can_access(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_support_specialist()
     and exists (select 1 from public.support_messages m where m.id = p_id and m.channel = 'ticket');
$$;

create or replace function public.is_verified_account()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.account_status = 'active'
      and (p.role is not null or p.contact_verified_at is not null)
  );
$$;

-- ── ۴) RLS: کاربر فقط از مسیر RPC به تیکت خودش می‌رسد؛ متخصص پشتیبان مستقیم ───────
-- (کاربر عادی هیچ policy مستقیمی روی support_messages ندارد تا internal_note/ایمیل‌ها نشت نکند)
drop policy if exists support_specialist_select on public.support_messages;
create policy support_specialist_select on public.support_messages for select to authenticated
  using (public.is_support_specialist() and channel = 'ticket');
drop policy if exists support_specialist_update on public.support_messages;
create policy support_specialist_update on public.support_messages for update to authenticated
  using (public.is_support_specialist() and channel = 'ticket')
  with check (public.is_support_specialist() and channel = 'ticket');

-- پاسخ‌های غیرداخلیِ تیکت خودِ کاربر (برای Realtime و خواندن مکالمه)
drop policy if exists replies_owner_select on public.support_replies;
create policy replies_owner_select on public.support_replies for select to authenticated
  using (is_internal = false and public.owns_ticket(message_id));
drop policy if exists replies_specialist_select on public.support_replies;
create policy replies_specialist_select on public.support_replies for select to authenticated
  using (public.specialist_can_access(message_id));
drop policy if exists replies_specialist_insert on public.support_replies;
create policy replies_specialist_insert on public.support_replies for insert to authenticated
  with check (author_id = auth.uid() and author_kind = 'staff' and public.specialist_can_access(message_id));

-- قفل فیلدهای حساس ردیف تیکت
create or replace function public.guard_support_message_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(current_setting('app.support_internal', true), '') = '1' then return new; end if;
  if public.has_permission('support', 'write') then return new; end if;
  if public.is_support_specialist() then
    if new.subject is distinct from old.subject or new.body is distinct from old.body
       or new.requester_id is distinct from old.requester_id or new.requester_email is distinct from old.requester_email
       or new.requester_name is distinct from old.requester_name or new.channel is distinct from old.channel
       or new.category is distinct from old.category
       or (new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null and new.assigned_to <> auth.uid()) then
      raise exception 'تغییر این فیلدها برای متخصص پشتیبان مجاز نیست' using errcode = '42501';
    end if;
    return new;
  end if;
  raise exception 'دسترسی لازم برای ویرایش پیام وجود ندارد' using errcode = '42501';
end $$;
drop trigger if exists trg_support_message_guard on public.support_messages;
create trigger trg_support_message_guard before update on public.support_messages
  for each row execute function public.guard_support_message_update();

-- پاسخ‌ها: ایمیل نویسنده هرگز ذخیره نمی‌شود (هویت از author_id)، نوع ai/system فقط سمت سرور
create or replace function public.support_reply_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  new.author_email := null;
  if auth.uid() is not null and coalesce(current_setting('app.support_internal', true), '') <> '1' then
    if new.author_kind in ('ai', 'system') then
      raise exception 'نوع نویسنده نامعتبر است' using errcode = '42501';
    end if;
    new.author_id := auth.uid();
    if new.author_name is null then
      select nullif(p.full_name, '') into v_name from public.profiles p where p.id = auth.uid();
      new.author_name := coalesce(v_name, case when new.author_kind = 'user' then 'کاربر' else 'پشتیبان' end);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_support_reply_before on public.support_replies;
create trigger trg_support_reply_before before insert on public.support_replies
  for each row execute function public.support_reply_before_insert();

-- وضعیت تیکت با هر پاسخ غیرداخلی به‌روز می‌شود
create or replace function public.support_reply_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_internal then return new; end if;
  perform set_config('app.support_internal', '1', true);
  update public.support_messages m set
    last_reply_at = new.created_at,
    updated_at = now(),
    status = case
      when new.author_kind = 'user' and m.status in ('answered', 'closed') then 'in_progress'::message_status
      when new.author_kind = 'staff' and m.status in ('new', 'in_progress') then 'answered'::message_status
      else m.status end
  where m.id = new.message_id;
  perform set_config('app.support_internal', '', true);
  return new;
end $$;
drop trigger if exists trg_support_reply_after on public.support_replies;
create trigger trg_support_reply_after after insert on public.support_replies
  for each row execute function public.support_reply_after_insert();

-- ── ۵) RPCهای کاربر (همه security definer و مبتنی بر auth.uid()) ───────────────
create or replace function public.support_my_tickets()
returns table (id uuid, subject text, category text, status message_status, priority message_priority,
               channel text, created_at timestamptz, last_reply_at timestamptz, reply_count bigint)
language sql stable security definer set search_path = public as $$
  select m.id, m.subject, m.category, m.status, m.priority, m.channel, m.created_at, m.last_reply_at,
         (select count(*) from public.support_replies r where r.message_id = m.id and r.is_internal = false)
  from public.support_messages m
  where m.requester_id = auth.uid()
  order by coalesce(m.last_reply_at, m.created_at) desc
  limit 100;
$$;

create or replace function public.support_ticket_get(p_id uuid)
returns table (id uuid, subject text, body text, category text, status message_status, priority message_priority,
               channel text, created_at timestamptz, last_reply_at timestamptz, assigned boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.subject, m.body, m.category, m.status, m.priority, m.channel, m.created_at, m.last_reply_at,
         (m.assigned_to is not null)
  from public.support_messages m
  where m.id = p_id and m.requester_id = auth.uid();
$$;

create or replace function public.support_create_ticket(p_subject text, p_body text, p_category text default 'general')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text; v_name text;
begin
  if auth.uid() is null then raise exception 'ورود لازم است' using errcode = '42501'; end if;
  if not public.is_verified_account() then raise exception 'حساب شما هنوز تأیید نشده است' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_subject, ''))) < 3 or char_length(p_subject) > 200 then
    raise exception 'موضوع باید بین ۳ تا ۲۰۰ کاراکتر باشد' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_body, ''))) < 5 or char_length(p_body) > 5000 then
    raise exception 'متن پیام باید بین ۵ تا ۵۰۰۰ کاراکتر باشد' using errcode = '22023';
  end if;
  if p_category not in ('general','technical','account','test','billing','content') then p_category := 'general'; end if;
  if not public.auth_rate_hit('ticket:' || auth.uid()::text, 6, 3600) then
    raise exception 'تعداد تیکت‌های ثبت‌شده در این ساعت زیاد است' using errcode = '54000';
  end if;
  select p.email, nullif(p.full_name, '') into v_email, v_name from public.profiles p where p.id = auth.uid();
  insert into public.support_messages (subject, body, category, requester_id, requester_email, requester_name, channel, status)
  values (trim(p_subject), trim(p_body), p_category, auth.uid(), coalesce(v_email, ''), v_name, 'ticket', 'new')
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.support_user_reply(p_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.owns_ticket(p_id) then raise exception 'دسترسی به این تیکت مجاز نیست' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_body, ''))) < 1 or char_length(p_body) > 5000 then
    raise exception 'متن پیام نامعتبر است' using errcode = '22023';
  end if;
  if exists (select 1 from public.support_messages m where m.id = p_id and m.channel <> 'ticket') then
    raise exception 'این گفت‌وگو با دستیار هوشمند انجام می‌شود' using errcode = '22023';
  end if;
  if not public.auth_rate_hit('reply:' || auth.uid()::text, 40, 3600) then
    raise exception 'تعداد پیام‌ها در این ساعت زیاد است' using errcode = '54000';
  end if;
  insert into public.support_replies (message_id, author_id, body, is_internal, author_kind, delivery_status)
  values (p_id, auth.uid(), trim(p_body), false, 'user', 'sent')
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.support_handoff(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.owns_ticket(p_id) then raise exception 'دسترسی به این گفت‌وگو مجاز نیست' using errcode = '42501'; end if;
  perform set_config('app.support_internal', '1', true);
  update public.support_messages set channel = 'ticket', status = 'new', updated_at = now()
   where id = p_id and channel = 'ai';
  if found then
    insert into public.support_replies (message_id, body, is_internal, author_kind, author_name, delivery_status)
    values (p_id, 'کاربر این گفت‌وگو را برای بررسی توسط پشتیبان انسانی ارجاع داد.', false, 'system', 'سیستم', 'sent');
  end if;
  perform set_config('app.support_internal', '', true);
end $$;

create or replace function public.support_close_ticket(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.owns_ticket(p_id) then raise exception 'دسترسی به این تیکت مجاز نیست' using errcode = '42501'; end if;
  perform set_config('app.support_internal', '1', true);
  update public.support_messages set status = 'closed', updated_at = now() where id = p_id;
  perform set_config('app.support_internal', '', true);
end $$;

create or replace function public.support_ai_status()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select s.is_enabled and s.secret_name is not null from public.service_settings s where s.name = 'support-ai'), false);
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'support_my_tickets()', 'support_ticket_get(uuid)', 'support_create_ticket(text,text,text)',
    'support_user_reply(uuid,text)', 'support_handoff(uuid)', 'support_close_ticket(uuid)', 'support_ai_status()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ── ۶) Realtime (فقط اگر publication وجود دارد) ──────────────────────────────
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.support_replies;
    exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.support_messages;
    exception when duplicate_object then null; end;
  end if;
end $$;

-- ── ۷) تنظیمات AI پشتیبانی: فقط metadata؛ مقدار کلید در Edge secrets می‌ماند ────────
-- مدیر از «سرویس‌ها و API» مدل/ارائه‌دهنده/فعال‌بودن را تنظیم می‌کند. کلید: supabase secrets set SUPPORT_AI_API_KEY=...
insert into public.service_settings (name, provider, model, is_enabled, config, secret_name)
values ('support-ai', 'openai-compatible', null, false,
        jsonb_build_object('endpoint', 'https://api.openai.com/v1', 'purpose', 'support_chat'),
        'SUPPORT_AI_API_KEY')
on conflict (name) do nothing;

commit;
