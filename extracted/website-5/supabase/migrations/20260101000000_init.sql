-- ============================================================
-- آریاسازه — Schema آغازین
-- اجرا: supabase db push  (یا از SQL Editor پروژه)
-- ============================================================
begin;

create extension if not exists pgcrypto;

-- ── انواع ─────────────────────────────────────────────----
do $$ begin
  create type app_role as enum ('super_admin','admin','content_manager','test_manager','support_agent','psychology_reviewer');
exception when duplicate_object then null; end $$;
do $$ begin
  create type account_status as enum ('active','suspended','pending');
exception when duplicate_object then null; end $$;
do $$ begin
  create type publish_status as enum ('draft','in_review','published','archived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type review_status as enum ('not_required','pending','approved','rejected');
exception when duplicate_object then null; end $$;
do $$ begin
  create type version_status as enum ('draft','in_review','approved','published','archived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type question_type as enum ('single_choice','multi_choice','likert');
exception when duplicate_object then null; end $$;
do $$ begin
  create type media_kind as enum ('image','document','video','audio','other');
exception when duplicate_object then null; end $$;
do $$ begin
  create type message_status as enum ('new','in_progress','answered','closed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type message_priority as enum ('low','normal','high','urgent');
exception when duplicate_object then null; end $$;
do $$ begin
  create type verification_status as enum ('unverified','pending','verified','rejected');
exception when duplicate_object then null; end $$;

-- ── پروفایل‌ها ────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  role app_role,                         -- null = کاربر بدون دسترسی مدیریتی
  account_status account_status not null default 'pending',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_email_idx on public.profiles (lower(email));
create index if not exists profiles_role_idx on public.profiles (role);

-- ── مجوزهای نقش‌ها (مدل انعطاف‌پذیر resource/action) ─────────
create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role app_role not null,
  resource text not null,
  action text not null,
  created_at timestamptz not null default now(),
  unique (role, resource, action)
);

-- ── لاگ رویدادها (فقط درج سمت سرور، فقط خواندن برای مجاز‌ها) ──
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  actor_role app_role,
  action text not null,
  resource_type text not null,
  resource_id text,
  result text not null default 'success' check (result in ('success','failure')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_resource_idx on public.audit_logs (resource_type, resource_id);

-- ── دعوت مدیران ─────────────────────────────────────────────
create table if not exists public.admin_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role app_role not null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_by_email text,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists admin_invites_email_idx on public.admin_invites (lower(email));

-- ── یادداشت داخلی کاربران ───────────────────────────────────
create table if not exists public.user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_email text,
  note text not null check (char_length(note) between 3 and 2000),
  created_at timestamptz not null default now()
);

-- ── تنظیمات سایت ────────────────────────────────────────────
create table if not exists public.site_settings (
  key text primary key check (key ~ '^[a-z0-9_.-]{2,64}$'),
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ── دسته‌بندی‌ها ─────────────────────────────────────────────
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind text not null check (kind in ('test','article','book','magazine')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ── صفحات CMS ───────────────────────────────────────────────
create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
  title text not null,
  content text not null default '',
  meta_description text,
  seo_title text,
  social_image_url text,
  status publish_status not null default 'draft',
  published_at timestamptz,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── بخش‌های صفحه‌ی اصلی (CMS ساختاریافته) ─────────────────────
create table if not exists public.site_sections (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_-]{2,50}$'),
  name text not null,
  config jsonb not null default '{}'::jsonb,
  draft_config jsonb not null default '{}'::jsonb,
  status publish_status not null default 'draft',
  sort_order integer not null default 0,
  published_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── آزمون‌ها ─────────────────────────────────────────────────
create table if not exists public.tests (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,90}$'),
  title_fa text not null,
  title_en text,
  short_description text,
  description text,
  cover_url text,
  category_id uuid references public.categories(id) on delete set null,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 240),
  report_type text,
  status publish_status not null default 'draft',
  review_status review_status not null default 'pending',
  sort_order integer not null default 0,
  language text not null default 'fa',
  version integer not null default 1,
  scientific_lead text,
  is_free boolean not null default true,
  price_irr integer check (price_irr is null or price_irr >= 0),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tests_status_idx on public.tests (status, sort_order);

-- ── نسخه‌های آزمون (snapshot تغییرناپذیر پس از انتشار) ────────
create table if not exists public.test_versions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests(id) on delete cascade,
  version_label text not null,
  status version_status not null default 'draft',
  scoring_rules jsonb not null default '{"method":"sum"}'::jsonb,
  snapshot jsonb,
  review_note text,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (test_id, version_label)
);

create table if not exists public.test_questions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.test_versions(id) on delete cascade,
  prompt text not null,
  help_text text,
  type question_type not null default 'likert',
  is_required boolean not null default true,
  dimension text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists test_questions_version_idx on public.test_questions (version_id, sort_order);

create table if not exists public.test_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.test_questions(id) on delete cascade,
  label text not null,
  value text,
  score numeric not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists test_options_question_idx on public.test_question_options (question_id, sort_order);

create table if not exists public.test_interpretations (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.test_versions(id) on delete cascade,
  dimension text not null default 'total',
  min_score numeric not null,
  max_score numeric not null,
  label text not null,
  description text not null,
  sort_order integer not null default 0,
  check (max_score >= min_score)
);

-- ── مجلات، مقالات، کتاب‌ها ───────────────────────────────────
create table if not exists public.magazines (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,90}$'),
  title text not null,
  issue_number text,
  description text,
  cover_url text,
  cover_alt text,
  pdf_url text,
  publisher text,
  status publish_status not null default 'draft',
  published_at timestamptz,
  seo_title text,
  seo_description text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,90}$'),
  title text not null,
  excerpt text,
  body text,
  author_name text,
  category_id uuid references public.categories(id) on delete set null,
  magazine_id uuid references public.magazines(id) on delete set null,
  cover_url text,
  cover_alt text,
  tags text[] not null default '{}',
  status publish_status not null default 'draft',
  review_status review_status not null default 'pending',
  published_at timestamptz,
  seo_title text,
  seo_description text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists articles_status_idx on public.articles (status, published_at desc);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,90}$'),
  title text not null,
  author text,
  description text,
  cover_url text,
  cover_alt text,
  publisher text,
  published_year integer check (published_year is null or published_year between 1000 and 2100),
  isbn text,
  category_id uuid references public.categories(id) on delete set null,
  status publish_status not null default 'draft',
  published_at timestamptz,
  resource_url text,
  resource_is_public boolean not null default false,
  seo_title text,
  seo_description text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── رسانه‌ها ─────────────────────────────────────────────────
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'site-media' check (bucket in ('site-media','private-documents')),
  storage_path text not null,
  public_url text,
  title text,
  alt_text text,
  mime_type text not null,
  kind media_kind not null default 'image',
  size_bytes bigint not null default 0,
  width integer,
  height integer,
  is_public boolean not null default true,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bucket, storage_path)
);

-- ── پشتیبانی ─────────────────────────────────────────────────
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (char_length(subject) between 3 and 200),
  body text not null check (char_length(body) between 5 and 5000),
  category text not null default 'general' check (category in ('general','technical','account','test','billing','content')),
  priority message_priority not null default 'normal',
  status message_status not null default 'new',
  requester_name text,
  requester_email text not null,
  requester_id uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  internal_note text,
  last_reply_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_messages_status_idx on public.support_messages (status, created_at desc);

create table if not exists public.support_replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.support_messages(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_email text,
  body text not null check (char_length(body) between 1 and 5000),
  is_internal boolean not null default false,
  delivery_status text not null default 'not_sent' check (delivery_status in ('not_sent','queued','sent','failed')),
  created_at timestamptz not null default now()
);

-- ── متخصصان ─────────────────────────────────────────────────
create table if not exists public.psychologists (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  title text,
  bio text,
  avatar_url text,
  credentials_summary text,
  verification_status verification_status not null default 'pending',
  is_active boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- اسناد و مدارک خصوصی؛ هرگز عمومی نمی‌شوند
create table if not exists public.psychologist_documents (
  id uuid primary key default gen_random_uuid(),
  psychologist_id uuid not null references public.psychologists(id) on delete cascade,
  bucket text not null default 'private-documents',
  storage_path text not null,
  kind text not null default 'license',
  status verification_status not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (bucket, storage_path)
);

-- ── سرویس‌های خارجی / هوش مصنوعی ─────────────────────────────
create table if not exists public.service_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  provider text not null,
  model text,
  is_enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  secret_name text,                       -- نام متغیر محیطی سمت سرور؛ هرگز مقدار کلید
  last_check_at timestamptz,
  last_check_status text check (last_check_status in ('ok','failed','unconfigured')),
  last_error text,
  monthly_cap_irr integer check (monthly_cap_irr is null or monthly_cap_irr >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── توابع کمکی ───────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.current_app_role()
returns app_role language sql stable security definer set search_path = public as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.account_status = 'active';
$$;

create or replace function public.has_permission(p_resource text, p_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.role is not null
      and (
        p.role = 'super_admin'
        or exists (
          select 1 from public.role_permissions rp
          where rp.role = p.role
            and (rp.resource = p_resource or rp.resource = '*')
            and (rp.action = p_action or rp.action = '*')
        )
      )
  );
$$;

revoke all on function public.has_permission(text, text) from public;
grant execute on function public.has_permission(text, text) to authenticated;
grant execute on function public.current_app_role() to authenticated;

-- ── ثبت رویداد ───────────────────────────────────────────────
create or replace function public.write_audit(
  p_action text, p_resource_type text, p_resource_id text,
  p_result text default 'success', p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, actor_email, actor_role, action, resource_type, resource_id, result, metadata)
  values (
    auth.uid(),
    (select email from public.profiles where id = auth.uid()),
    (select role from public.profiles where id = auth.uid()),
    p_action, p_resource_type, p_resource_id, p_result, coalesce(p_metadata, '{}'::jsonb)
  );
end $$;

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id text; v_meta jsonb := '{}'::jsonb;
begin
  if tg_op = 'DELETE' then v_id := old.id::text; else v_id := new.id::text; end if;

  -- فقط کلیدهای غیرحساس تغییرات
  if tg_op = 'UPDATE' then
    if tg_table_name = 'profiles' then
      if old.role is distinct from new.role then v_meta := v_meta || jsonb_build_object('role_changed', true); end if;
      if old.account_status is distinct from new.account_status then v_meta := v_meta || jsonb_build_object('status_changed', true); end if;
    elsif to_jsonb(new) ? 'status' then
      v_meta := jsonb_build_object('status', to_jsonb(new)->>'status');
    end if;
  end if;

  insert into public.audit_logs (actor_id, actor_email, actor_role, action, resource_type, resource_id, result, metadata)
  values (auth.uid(), auth.jwt()->>'email', public.current_app_role(),
          lower(tg_op), tg_table_name, v_id, 'success', v_meta);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- ── محافظت از نقش‌ها و حساب‌ها ───────────────────────────────
create or replace function public.guard_profile_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- مسیرهای بدون JWT (service_role / اسکریپت bootstrap) مجازند
  if auth.uid() is null then return new; end if;

  if new.role is distinct from old.role or new.account_status is distinct from old.account_status then
    if not public.has_permission('admins','write') then
      raise exception 'دسترسی لازم برای تغییر نقش یا وضعیت حساب وجود ندارد' using errcode = '42501';
    end if;
    if old.role = 'super_admin' and new.role is distinct from 'super_admin' then
      if (select count(*) from public.profiles where role = 'super_admin' and account_status = 'active') <= 1 then
        raise exception 'آخرین مدیر ارشد را نمی‌توان حذف یا تنزل داد' using errcode = '42501';
      end if;
    end if;
    if new.id = auth.uid() and new.role is distinct from old.role then
      raise exception 'تغییر نقش حساب خود مجاز نیست' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- ── قفل نسخه‌های منتشرشده ───────────────────────────────────
create or replace function public.lock_published_version()
returns trigger language plpgsql as $$
begin
  if old.status = 'published' then
    raise exception 'نسخه‌ی منتشرشده قابل ویرایش نیست؛ نسخه‌ی جدید بسازید' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.guard_question_edit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status version_status; v_version uuid;
begin
  if tg_op = 'DELETE' then v_version := old.version_id; else v_version := new.version_id; end if;
  select status into v_status from public.test_versions where id = v_version;
  if v_status = 'published' then
    raise exception 'سؤالات نسخه‌ی منتشرشده قابل ویرایش نیستند' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create or replace function public.guard_option_edit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status version_status; v_qid uuid;
begin
  if tg_op = 'DELETE' then v_qid := old.question_id; else v_qid := new.question_id; end if;
  select v.status into v_status
  from public.test_question_options o
  join public.test_questions q on q.id = o.question_id
  join public.test_versions v on v.id = q.version_id
  where q.id = v_qid;
  if v_status = 'published' then
    raise exception 'گزینه‌های نسخه‌ی منتشرشده قابل ویرایش نیستند' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- ── انتشار نسخه‌ی آزمون (سمت سرور) ──────────────────────────
create or replace function public.publish_test_version(p_version_id uuid)
returns public.test_versions language plpgsql security definer set search_path = public as $$
declare v_version public.test_versions; v_snapshot jsonb; v_questions int;
begin
  if not public.has_permission('tests','publish') then
    raise exception 'دسترسی انتشار آزمون وجود ندارد' using errcode = '42501';
  end if;

  select * into v_version from public.test_versions where id = p_version_id for update;
  if v_version is null then raise exception 'نسخه یافت نشد'; end if;
  if v_version.status <> 'approved' then
    raise exception 'مرحله‌ی بازبینی علمی این نسخه تکمیل نشده است؛ انتشار فقط پس از تأیید مجاز است' using errcode = '42501';
  end if;

  select count(*) into v_questions from public.test_questions where version_id = p_version_id;
  if v_questions = 0 then raise exception 'نسخه بدون سؤال قابل انتشار نیست'; end if;
  if exists (select 1 from public.test_questions q where q.version_id = p_version_id and not exists (select 1 from public.test_question_options o where o.question_id = q.id)) then
    raise exception 'هر سؤال باید حداقل یک گزینه داشته باشد';
  end if;

  select jsonb_build_object(
    'questions', coalesce(jsonb_agg(q.j || jsonb_build_object('options', q.opts)) filter (where q.id is not null), '[]'::jsonb),
    'scoring_rules', v_version.scoring_rules,
    'interpretations', coalesce((select jsonb_agg(to_jsonb(i) order by i.sort_order) from public.test_interpretations i where i.version_id = p_version_id), '[]'::jsonb)
  ) into v_snapshot
  from (
    select qq.id, to_jsonb(qq) as j,
      coalesce((select jsonb_agg(to_jsonb(o) order by o.sort_order) from public.test_question_options o where o.question_id = qq.id), '[]'::jsonb) as opts
    from public.test_questions qq where qq.version_id = p_version_id
  ) q;

  update public.test_versions set status = 'archived'
  where test_id = v_version.test_id and status = 'published' and id <> p_version_id;

  update public.test_versions
  set status = 'published', snapshot = v_snapshot, published_at = now(), updated_at = now()
  where id = p_version_id returning * into v_version;

  update public.tests set status = 'published', review_status = 'approved',
    published_at = coalesce(published_at, now()), version = (select count(*) from public.test_versions where test_id = v_version.test_id and published_at is not null), updated_at = now()
  where id = v_version.test_id;

  perform public.write_audit('publish', 'test_versions', p_version_id::text, 'success', jsonb_build_object('snapshot_questions', v_questions));
  return v_version;
end $$;

create or replace function public.approve_test_version(p_version_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('tests','review') then
    raise exception 'دسترسی بازبینی علمی وجود ندارد' using errcode = '42501';
  end if;
  update public.test_versions set status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
  where id = p_version_id and status in ('draft','in_review');
  if not found then raise exception 'نسخه در وضعیت قابل تأیید نیست'; end if;
  perform public.write_audit('approve', 'test_versions', p_version_id::text);
end $$;

-- ── عملیات مدیریتی کاربران (سمت سرور) ─────────────────────────
create or replace function public.admin_set_account_status(p_user_id uuid, p_status account_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('users','write') then
    raise exception 'دسترسی لازم وجود ندارد' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then raise exception 'تغییر وضعیت حساب خود مجاز نیست'; end if;
  update public.profiles set account_status = p_status where id = p_user_id;
  perform public.write_audit(case p_status when 'suspended' then 'suspend' else 'activate' end, 'profiles', p_user_id::text, 'success',
    jsonb_build_object('reason_present', p_reason is not null));
end $$;

create or replace function public.admin_add_user_note(p_user_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('support','read') then
    raise exception 'دسترسی لازم وجود ندارد' using errcode = '42501';
  end if;
  insert into public.user_notes (user_id, author_id, author_email, note)
  values (p_user_id, auth.uid(), auth.jwt()->>'email', left(p_note, 2000));
  perform public.write_audit('add_note', 'profiles', p_user_id::text);
end $$;

-- ── ایجاد پروفایل برای کاربر جدید ─────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, account_status)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), null, 'pending')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ── اتصال triggerها ───────────────────────────────────────────
drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles for each row execute function public.touch_updated_at();

drop trigger if exists trg_pages_updated on public.pages;
create trigger trg_pages_updated before update on public.pages for each row execute function public.touch_updated_at();

drop trigger if exists trg_sections_updated on public.site_sections;
create trigger trg_sections_updated before update on public.site_sections for each row execute function public.touch_updated_at();

do $$
declare t text;
begin
  foreach t in array array['tests','test_versions','articles','magazines','books','support_messages','psychologists','service_settings']
  loop
    execute format('drop trigger if exists trg_%I_updated on public.%I', t, t);
    execute format('create trigger trg_%I_updated before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

drop trigger if exists trg_profile_guard on public.profiles;
create trigger trg_profile_guard before update on public.profiles for each row execute function public.guard_profile_changes();

drop trigger if exists trg_version_lock on public.test_versions;
create trigger trg_version_lock before update on public.test_versions for each row
when (old.status = 'published' and new.snapshot is not distinct from old.snapshot and new.status = old.status)
execute function public.lock_published_version();

drop trigger if exists trg_questions_guard on public.test_questions;
create trigger trg_questions_guard before insert or update or delete on public.test_questions for each row execute function public.guard_question_edit();

drop trigger if exists trg_options_guard on public.test_question_options;
create trigger trg_options_guard before insert or update or delete on public.test_question_options for each row execute function public.guard_option_edit();

create or replace function public.guard_interpretation_edit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status version_status; v_vid uuid;
begin
  if tg_op = 'DELETE' then v_vid := old.version_id; else v_vid := new.version_id; end if;
  select status into v_status from public.test_versions where id = v_vid;
  if v_status = 'published' then
    raise exception 'تفسیرهای نسخه‌ی منتشرشده تغییرناپذیرند' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists trg_interpretations_guard on public.test_interpretations;
create trigger trg_interpretations_guard before insert or update or delete on public.test_interpretations for each row execute function public.guard_interpretation_edit();

drop trigger if exists trg_profiles_audit on public.profiles;
create trigger trg_profiles_audit after update on public.profiles for each row execute function public.audit_row_change();

do $$
declare t text;
begin
  foreach t in array array['pages','site_sections','tests','test_versions','articles','magazines','books','media','service_settings','role_permissions','psychologist_documents']
  loop
    execute format('drop trigger if exists trg_%I_audit on public.%I', t, t);
    execute format('create trigger trg_%I_audit after insert or update or delete on public.%I for each row execute function public.audit_row_change()', t, t);
  end loop;
end $$;

-- ── فعال‌سازی RLS ────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.admin_invites enable row level security;
alter table public.user_notes enable row level security;
alter table public.site_settings enable row level security;
alter table public.categories enable row level security;
alter table public.pages enable row level security;
alter table public.site_sections enable row level security;
alter table public.tests enable row level security;
alter table public.test_versions enable row level security;
alter table public.test_questions enable row level security;
alter table public.test_question_options enable row level security;
alter table public.test_interpretations enable row level security;
alter table public.magazines enable row level security;
alter table public.articles enable row level security;
alter table public.books enable row level security;
alter table public.media enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_replies enable row level security;
alter table public.psychologists enable row level security;
alter table public.psychologist_documents enable row level security;
alter table public.service_settings enable row level security;

-- ── سیاست‌ها: پروفایل‌ها ─────────────────────────────────────
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_permission('users','read'));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ── مجوزها ───────────────────────────────────────────────────
drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (
    auth.uid() is not null
    and public.current_app_role() is not null
    and (role = public.current_app_role() or public.has_permission('admins','read'))
  );
drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (public.has_permission('admins','write')) with check (public.has_permission('admins','write'));

-- ── لاگ‌ها: خواندن محدود، بدون نوشتن از کلاینت ─────────────────
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.has_permission('audit','read'));

-- ── دعوت‌ها ──────────────────────────────────────────────────
drop policy if exists admin_invites_select on public.admin_invites;
create policy admin_invites_select on public.admin_invites for select to authenticated
  using (public.has_permission('admins','read'));

-- ── یادداشت‌های کاربران ───────────────────────────────────────
drop policy if exists user_notes_select on public.user_notes;
create policy user_notes_select on public.user_notes for select to authenticated
  using (public.has_permission('support','read'));
drop policy if exists user_notes_insert on public.user_notes;
create policy user_notes_insert on public.user_notes for insert to authenticated
  with check (author_id = auth.uid() and public.has_permission('support','read'));

-- ── تنظیمات سایت ─────────────────────────────────────────────
drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read on public.site_settings for select to anon, authenticated
  using (is_public = true);
drop policy if exists site_settings_staff_read on public.site_settings;
create policy site_settings_staff_read on public.site_settings for select to authenticated
  using (public.has_permission('settings','read'));
drop policy if exists site_settings_write on public.site_settings;
create policy site_settings_write on public.site_settings for all to authenticated
  using (public.has_permission('settings','write')) with check (public.has_permission('settings','write'));

-- ── دسته‌بندی‌ها ─────────────────────────────────────────────
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories for select to anon, authenticated using (true);
drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories for all to authenticated
  using (public.has_permission('content','write')) with check (public.has_permission('content','write'));

-- ── ماکرو سیاست برای جداول محتوایی ───────────────────────────
do $$
declare t text; pub text;
begin
  foreach t in array array['pages','articles','magazines','books'] loop
    execute format('drop policy if exists %I_public_read on public.%I', t, t);
    execute format($f$create policy %I_public_read on public.%I for select to anon, authenticated using (status = 'published')$f$, t, t);
    execute format('drop policy if exists %I_staff_read on public.%I', t, t);
    execute format($f$create policy %I_staff_read on public.%I for select to authenticated using (public.has_permission('content','read'))$f$, t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format($f$create policy %I_write on public.%I for all to authenticated using (public.has_permission('content','write')) with check (public.has_permission('content','write'))$f$, t, t);
  end loop;
end $$;

-- بخش‌های صفحه اصلی
drop policy if exists site_sections_public_read on public.site_sections;
create policy site_sections_public_read on public.site_sections for select to anon, authenticated using (status = 'published');
drop policy if exists site_sections_staff_read on public.site_sections;
create policy site_sections_staff_read on public.site_sections for select to authenticated using (public.has_permission('content','read'));
drop policy if exists site_sections_write on public.site_sections;
create policy site_sections_write on public.site_sections for all to authenticated
  using (public.has_permission('content','write')) with check (public.has_permission('content','write'));

-- آزمون‌ها
drop policy if exists tests_public_read on public.tests;
create policy tests_public_read on public.tests for select to anon, authenticated
  using (status = 'published' and review_status = 'approved');
drop policy if exists tests_staff_read on public.tests;
create policy tests_staff_read on public.tests for select to authenticated using (public.has_permission('tests','read'));
drop policy if exists tests_write on public.tests;
create policy tests_write on public.tests for all to authenticated
  using (public.has_permission('tests','write')) with check (public.has_permission('tests','write'));

drop policy if exists versions_public_read on public.test_versions;
create policy versions_public_read on public.test_versions for select to anon, authenticated
  using (status = 'published' and exists (select 1 from public.tests t where t.id = test_id and t.status = 'published' and t.review_status = 'approved'));
drop policy if exists versions_staff_read on public.test_versions;
create policy versions_staff_read on public.test_versions for select to authenticated using (public.has_permission('tests','read'));
drop policy if exists versions_write on public.test_versions;
create policy versions_write on public.test_versions for all to authenticated
  using (public.has_permission('tests','write')) with check (public.has_permission('tests','write'));

drop policy if exists questions_public_read on public.test_questions;
create policy questions_public_read on public.test_questions for select to anon, authenticated
  using (exists (select 1 from public.test_versions v where v.id = version_id and v.status = 'published' and exists (select 1 from public.tests t where t.id = v.test_id and t.status = 'published')));
drop policy if exists questions_staff_read on public.test_questions;
create policy questions_staff_read on public.test_questions for select to authenticated using (public.has_permission('tests','read'));
drop policy if exists questions_write on public.test_questions;
create policy questions_write on public.test_questions for all to authenticated
  using (public.has_permission('tests','write')) with check (public.has_permission('tests','write'));

drop policy if exists options_public_read on public.test_question_options;
create policy options_public_read on public.test_question_options for select to anon, authenticated
  using (exists (select 1 from public.test_questions q join public.test_versions v on v.id = q.version_id where q.id = question_id and v.status = 'published' and exists (select 1 from public.tests t where t.id = v.test_id and t.status = 'published')));
drop policy if exists options_staff_read on public.test_question_options;
create policy options_staff_read on public.test_question_options for select to authenticated using (public.has_permission('tests','read'));
drop policy if exists options_write on public.test_question_options;
create policy options_write on public.test_question_options for all to authenticated
  using (public.has_permission('tests','write')) with check (public.has_permission('tests','write'));

drop policy if exists interpretations_public_read on public.test_interpretations;
create policy interpretations_public_read on public.test_interpretations for select to anon, authenticated
  using (exists (select 1 from public.test_versions v where v.id = version_id and v.status = 'published'));
drop policy if exists interpretations_staff_read on public.test_interpretations;
create policy interpretations_staff_read on public.test_interpretations for select to authenticated using (public.has_permission('tests','read'));
drop policy if exists interpretations_write on public.test_interpretations;
create policy interpretations_write on public.test_interpretations for all to authenticated
  using (public.has_permission('tests','write')) with check (public.has_permission('tests','write'));

-- رسانه
drop policy if exists media_public_read on public.media;
create policy media_public_read on public.media for select to anon, authenticated
  using (is_public = true and bucket = 'site-media');
drop policy if exists media_staff_read on public.media;
create policy media_staff_read on public.media for select to authenticated using (public.has_permission('media','read'));
drop policy if exists media_write on public.media;
create policy media_write on public.media for all to authenticated
  using (public.has_permission('media','write')) with check (public.has_permission('media','write'));

-- پشتیبانی
drop policy if exists support_insert_any on public.support_messages;
create policy support_insert_any on public.support_messages for insert to anon, authenticated
  with check (
    (requester_id is null or requester_id = auth.uid())
    and status = 'new'
    and assigned_to is null
    and internal_note is null
    and last_reply_at is null
  );
drop policy if exists support_staff_read on public.support_messages;
create policy support_staff_read on public.support_messages for select to authenticated using (public.has_permission('support','read'));
drop policy if exists support_staff_update on public.support_messages;
create policy support_staff_update on public.support_messages for update to authenticated
  using (public.has_permission('support','write')) with check (public.has_permission('support','write'));
drop policy if exists support_staff_delete on public.support_messages;
create policy support_staff_delete on public.support_messages for delete to authenticated using (public.has_permission('support','delete'));

drop policy if exists replies_staff_read on public.support_replies;
create policy replies_staff_read on public.support_replies for select to authenticated using (public.has_permission('support','read'));
drop policy if exists replies_staff_insert on public.support_replies;
create policy replies_staff_insert on public.support_replies for insert to authenticated
  with check (author_id = auth.uid() and public.has_permission('support','write'));

-- متخصصان
drop policy if exists psychologists_public_read on public.psychologists;
create policy psychologists_public_read on public.psychologists for select to anon, authenticated
  using (is_active = true and verification_status = 'verified');
drop policy if exists psychologists_staff_read on public.psychologists;
create policy psychologists_staff_read on public.psychologists for select to authenticated using (public.has_permission('psychologists','read'));
drop policy if exists psychologists_write on public.psychologists;
create policy psychologists_write on public.psychologists for all to authenticated
  using (public.has_permission('psychologists','write')) with check (public.has_permission('psychologists','write'));

drop policy if exists psydocs_read on public.psychologist_documents;
create policy psydocs_read on public.psychologist_documents for select to authenticated
  using (public.has_permission('psychologists','manage_documents'));
drop policy if exists psydocs_write on public.psychologist_documents;
create policy psydocs_write on public.psychologist_documents for all to authenticated
  using (public.has_permission('psychologists','manage_documents')) with check (public.has_permission('psychologists','manage_documents'));

-- سرویس‌ها: هرگز برای anon
drop policy if exists services_read on public.service_settings;
create policy services_read on public.service_settings for select to authenticated using (public.has_permission('settings','api'));
drop policy if exists services_write on public.service_settings;
create policy services_write on public.service_settings for all to authenticated
  using (public.has_permission('settings','api')) with check (public.has_permission('settings','api'));

-- ── داده‌های اولیه‌ی مجوزها ───────────────────────────────────
insert into public.role_permissions (role, resource, action) values
  ('admin','users','read'),('admin','users','write'),
  ('admin','admins','read'),
  ('admin','content','read'),('admin','content','write'),
  ('admin','tests','read'),('admin','tests','write'),
  ('admin','media','read'),('admin','media','write'),
  ('admin','support','read'),('admin','support','write'),
  ('admin','psychologists','read'),('admin','psychologists','write'),
  ('admin','settings','read'),('admin','settings','write'),
  ('admin','audit','read'),
  ('content_manager','content','read'),('content_manager','content','write'),
  ('content_manager','media','read'),('content_manager','media','write'),
  ('content_manager','tests','read'),
  ('test_manager','tests','read'),('test_manager','tests','write'),('test_manager','tests','publish'),
  ('test_manager','content','read'),('test_manager','media','read'),('test_manager','media','write'),
  ('support_agent','support','read'),('support_agent','support','write'),('support_agent','users','read'),
  ('support_agent','psychologists','read'),
  ('psychology_reviewer','tests','read'),('psychology_reviewer','tests','review'),('psychology_reviewer','content','read')
on conflict (role, resource, action) do nothing;

insert into public.categories (slug, name, kind, sort_order) values
  ('personality','شخصیت','test',1), ('stress','استرس و هیجان','test',2),
  ('communication','ارتباط و روابط','test',3), ('cognition','تمرکز و شناخت','test',4),
  ('self-growth','رشد فردی','article',1), ('mindfulness','ذهن‌آگاهی','article',2),
  ('psychology','روان‌شناسی','article',3),
  ('book-self-growth','رشد فردی','book',1), ('book-psychology','روان‌شناسی','book',2)
on conflict (slug) do nothing;

-- محتوای اولیه‌ی بخش‌ها (همان محتوای منتشرشده‌ی فعلی سایت)
insert into public.site_sections (key, name, status, sort_order, published_at, config, draft_config) values
('hero','بخش قهرمان', 'published', 1, now(),
 '{"eyebrow":"آریاسازه","titleLine1":"آرامش ذهن،","titleLine2":"آینده‌ای روشن‌تر","description":"آریاسازه مسیری هوشمند برای شناخت بهتر خود است: آزمون‌های خودشناسی، گزارش‌های شخصی، تمرین‌های روزانه و پیگیری رشد، با تکیه بر دانش روان‌شناسی و همراهی متخصصان.","primaryCta":{"label":"شروع مسیر من","href":"#steps"},"secondaryCta":{"label":"آشنایی با آریاسازه","href":"#assistant"}}'::jsonb,
 '{"eyebrow":"آریاسازه","titleLine1":"آرامش ذهن،","titleLine2":"آینده‌ای روشن‌تر","description":"آریاسازه مسیری هوشمند برای شناخت بهتر خود است: آزمون‌های خودشناسی، گزارش‌های شخصی، تمرین‌های روزانه و پیگیری رشد، با تکیه بر دانش روان‌شناسی و همراهی متخصصان.","primaryCta":{"label":"شروع مسیر من","href":"#steps"},"secondaryCta":{"label":"آشنایی با آریاسازه","href":"#assistant"}}'::jsonb),
('tests-heading','عنوان بخش آزمون‌ها','published',2, now(),
 '{"label":"آزمون‌های ما","title":"کتابخانه‌ی آزمون‌ها","description":"آزمون‌های کوتاه و کاربردی برای شناخت بهتر شخصیت، عادت‌ها، هیجان‌ها و سبک ارتباطی شما."}'::jsonb,
 '{"label":"آزمون‌های ما","title":"کتابخانه‌ی آزمون‌ها","description":"آزمون‌های کوتاه و کاربردی برای شناخت بهتر شخصیت، عادت‌ها، هیجان‌ها و سبک ارتباطی شما."}'::jsonb),
('cta','بنر پایانی','published',3, now(),
 '{"title":"ترکیبی از علم، فناوری و همراهی انسان","description":"آریاسازه با ترکیب دانش روان‌شناسی، ابزارهای هوشمند و طراحی تجربه، مسیر شناخت و رشد فردی را ساده‌تر و قابل‌پیگیری می‌کند.","ctaLabel":"شروع مسیر من","ctaHref":"#steps"}'::jsonb,
 '{"title":"ترکیبی از علم، فناوری و همراهی انسان","description":"آریاسازه با ترکیب دانش روان‌شناسی، ابزارهای هوشمند و طراحی تجربه، مسیر شناخت و رشد فردی را ساده‌تر و قابل‌پیگیری می‌کند.","ctaLabel":"شروع مسیر من","ctaHref":"#steps"}'::jsonb)
on conflict (key) do nothing;

insert into public.site_settings (key, value, is_public) values
  ('seo.default', '{"title":"آریاسازه | آرامش ذهن، آینده‌ای روشن‌تر","description":"آزمون‌های خودشناسی، گزارش‌های شخصی و تمرین‌های روزانه برای رشد فردی.","ogImage":""}'::jsonb, true),
  ('contact.general', '{"email":"salam@ariasazeh.ir","supportNote":"محتوای این وب‌سایت جایگزین مشاوره‌ی تخصصی نیست."}'::jsonb, true)
on conflict (key) do nothing;

-- اولین مدیر را با اسکریپت bootstrap (service_role) بسازید؛ اینجا هیچ مدیرSeed نمی‌شود.
commit;
