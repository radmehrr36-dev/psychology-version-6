-- ============================================================
-- آریاسازه — سیستم یکپارچه‌ی بهبود فردی
--   بانک تمرین ← مسیر (مراحل/فعالیت‌ها) ← قواعد پیشنهاد ← نتیجه‌ی آزمون
--   ← پیشنهاد ← برنامه‌ی شخصی (snapshot) ← اجرای تمرین ← پیشرفت/آمار
--
-- سازگاری:
--  • فقط جدول/تابع جدید می‌سازد؛ هیچ جدول، ستون یا تابع قبلی را تغییر نمی‌دهد یا حذف نمی‌کند.
--  • فقط یک trigger جدید روی test_results اضافه می‌شود (AFTER INSERT) که خطایش هرگز ثبت نتیجه را متوقف نمی‌کند.
--  • idempotent؛ چندبار اجرا خطا نمی‌دهد.
--  • وابستگی‌ها: init (tests, test_results, publish_status, has_permission, audit_row_change, touch_updated_at)،
--    20260105 (test_results). اگر 20261110 اعمال شده باشد، کاربر باید حساب «قابل‌استفاده» باشد؛ وگرنه فقط active.
-- ============================================================
begin;

-- ── کمکی: حساب کاربر قابل استفاده است؟ (همسو با account_usable_hardening در صورت وجود) ──
create or replace function public.improvement_user_ok()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v boolean;
begin
  if auth.uid() is null then return false; end if;
  if pg_catalog.to_regprocedure('public.account_usable_hardening()') is not null then
    execute 'select public.account_usable_hardening()' into v;
    return coalesce(v, false);
  end if;
  return exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_status = 'active');
end $$;

-- ═══════════════ بانک تمرین‌ها ═══════════════
create table if not exists public.improvement_exercises (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 150),
  description text check (description is null or char_length(description) <= 1000),
  goal text check (goal is null or char_length(goal) <= 500),
  category text not null default 'general' check (char_length(category) between 2 and 60),
  instructions text not null check (char_length(instructions) between 10 and 5000),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 240),
  exercise_type text not null check (exercise_type in ('reflection','checklist','rating')),
  content jsonb not null default '{}'::jsonb,
  response_required boolean not null default false,
  status public.publish_status not null default 'draft' check (status in ('draft','published','archived')),
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists improvement_exercises_status_idx on public.improvement_exercises (status, category);

-- ═══════════════ مسیرهای بهبود ═══════════════
create table if not exists public.improvement_paths (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 150),
  description text check (description is null or char_length(description) <= 2000),
  goal text check (goal is null or char_length(goal) <= 600),
  topic text not null default 'general' check (char_length(topic) between 2 and 60),
  user_description text check (user_description is null or char_length(user_description) <= 1500),
  duration_days integer not null default 7 check (duration_days between 1 and 365),
  status public.publish_status not null default 'draft' check (status in ('draft','published','archived')),
  version integer not null default 0,
  sort_order integer not null default 0,
  exclusive_group text check (exclusive_group is null or char_length(exclusive_group) between 2 and 60),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists improvement_paths_status_idx on public.improvement_paths (status, sort_order);

create table if not exists public.improvement_path_steps (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null references public.improvement_paths(id) on delete cascade,
  day_number integer not null check (day_number between 1 and 365),
  title text not null check (char_length(title) between 2 and 150),
  description text check (description is null or char_length(description) <= 1500),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists improvement_path_steps_idx on public.improvement_path_steps (path_id, day_number, sort_order);

create table if not exists public.improvement_path_activities (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.improvement_path_steps(id) on delete cascade,
  exercise_id uuid not null references public.improvement_exercises(id) on delete restrict,
  sort_order integer not null default 0,
  is_required boolean not null default true,
  suggested_time text check (suggested_time is null or char_length(suggested_time) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists improvement_path_activities_step_idx on public.improvement_path_activities (step_id, sort_order);
create index if not exists improvement_path_activities_exercise_idx on public.improvement_path_activities (exercise_id);

-- ═══════════════ قواعد پیشنهاد ═══════════════
create table if not exists public.improvement_recommendation_rules (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 150),
  test_id uuid not null references public.tests(id) on delete cascade,
  version_id uuid references public.test_versions(id) on delete cascade,   -- null = همه‌ی نسخه‌ها
  condition_mode text not null default 'all' check (condition_mode in ('all','any')),
  conditions jsonb not null,
  path_id uuid not null references public.improvement_paths(id) on delete cascade,
  priority integer not null default 100 check (priority between 0 and 10000),
  strength text not null default 'suggested' check (strength in ('suggested','definite')),
  is_active boolean not null default false,
  admin_note text check (admin_note is null or char_length(admin_note) <= 1500),
  user_note text check (user_note is null or char_length(user_note) <= 600),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists improvement_rules_test_idx on public.improvement_recommendation_rules (test_id, is_active, priority desc);
create index if not exists improvement_rules_path_idx on public.improvement_recommendation_rules (path_id);

-- ═══════════════ پیشنهادهای تولیدشده برای نتیجه‌ی کاربر ═══════════════
create table if not exists public.improvement_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null references public.test_results(attempt_id) on delete cascade,
  rule_id uuid references public.improvement_recommendation_rules(id) on delete set null,
  path_id uuid not null references public.improvement_paths(id) on delete cascade,
  rank integer not null default 1,
  strength text not null default 'suggested',
  reason text,
  explanation jsonb not null default '[]'::jsonb,
  status text not null default 'suggested' check (status in ('suggested','started')),
  created_at timestamptz not null default now(),
  unique (attempt_id, path_id)
);
create index if not exists improvement_recommendations_user_idx on public.improvement_recommendations (user_id, created_at desc);

-- ═══════════════ برنامه‌ی شخصی کاربر (snapshot) ═══════════════
create table if not exists public.user_improvement_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  path_id uuid references public.improvement_paths(id) on delete set null,
  path_version integer not null,
  path_title text not null,
  path_goal text,
  source_attempt_id uuid references public.test_results(attempt_id) on delete set null,
  status text not null default 'active' check (status in ('pending','active','paused','completed','cancelled')),
  started_at timestamptz not null default now(),
  planned_end_date date not null,
  paused_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists user_plans_user_idx on public.user_improvement_plans (user_id, created_at desc);
-- هر کاربر در هر لحظه فقط یک برنامه‌ی «فعال» دارد و از یک مسیر، یک برنامه‌ی باز (فعال/متوقف/در انتظار)
create unique index if not exists user_plans_one_active_idx on public.user_improvement_plans (user_id) where status = 'active';
create unique index if not exists user_plans_one_open_per_path_idx on public.user_improvement_plans (user_id, path_id)
  where status in ('pending','active','paused') and path_id is not null;

create table if not exists public.user_plan_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.user_improvement_plans(id) on delete cascade,
  day_number integer not null,
  title text not null,
  description text,
  sort_order integer not null default 0
);
create index if not exists user_plan_steps_plan_idx on public.user_plan_steps (plan_id, day_number, sort_order);

create table if not exists public.user_plan_activities (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.user_improvement_plans(id) on delete cascade,
  plan_step_id uuid not null references public.user_plan_steps(id) on delete cascade,
  exercise_id uuid references public.improvement_exercises(id) on delete set null,
  exercise_version integer not null default 1,
  title text not null,
  goal text,
  instructions text not null,
  duration_minutes integer,
  exercise_type text not null,
  content jsonb not null default '{}'::jsonb,
  response_required boolean not null default false,
  is_required boolean not null default true,
  suggested_time text,
  sort_order integer not null default 0,
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed','skipped')),
  response jsonb,
  user_note text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists user_plan_activities_plan_idx on public.user_plan_activities (plan_id, status);
create index if not exists user_plan_activities_step_idx on public.user_plan_activities (plan_step_id, sort_order);
create index if not exists user_plan_activities_exercise_idx on public.user_plan_activities (exercise_id);

-- ═══════════════ اعتبارسنجی و محافظ‌ها ═══════════════

-- تمرین: اعتبارسنجی محتوا، نسخه‌بندی، جلوگیری از غیرفعال‌کردن تمرین مورد استفاده‌ی مسیر منتشرشده
create or replace function public.improvement_exercise_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare items jsonb; it jsonb; mn int; mx int;
begin
  if new.exercise_type = 'checklist' then
    items := coalesce(new.content->'items', '[]'::jsonb);
    if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) not between 1 and 20 then
      raise exception 'چک‌لیست باید ۱ تا ۲۰ مورد داشته باشد' using errcode = '22023';
    end if;
    for it in select * from jsonb_array_elements(items) loop
      if jsonb_typeof(it) <> 'string' or char_length(btrim(it #>> '{}')) not between 1 and 200 then
        raise exception 'هر مورد چک‌لیست باید متنی بین ۱ تا ۲۰۰ کاراکتر باشد' using errcode = '22023';
      end if;
    end loop;
    new.content := jsonb_build_object('items', items);
  elsif new.exercise_type = 'rating' then
    mn := coalesce((new.content->>'min')::int, 1); mx := coalesce((new.content->>'max')::int, 5);
    if mx - mn < 1 or mx - mn > 9 then raise exception 'بازه‌ی امتیازدهی باید بین ۲ تا ۱۰ گزینه باشد' using errcode = '22023'; end if;
    new.content := jsonb_build_object('min', mn, 'max', mx,
      'low_label', left(coalesce(new.content->>'low_label', ''), 60), 'high_label', left(coalesce(new.content->>'high_label', ''), 60),
      'prompt', left(coalesce(new.content->>'prompt', ''), 300));
    new.response_required := true;
  else
    new.content := jsonb_build_object('prompt', left(coalesce(new.content->>'prompt', ''), 500));
  end if;

  if tg_op = 'INSERT' then
    new.version := 1;
    if auth.uid() is not null then new.status := 'draft'; new.created_by := auth.uid(); end if;
  else
    if auth.uid() is not null then new.updated_by := auth.uid(); end if;
    if new.title is distinct from old.title or new.goal is distinct from old.goal or new.instructions is distinct from old.instructions
       or new.content is distinct from old.content or new.exercise_type is distinct from old.exercise_type
       or new.duration_minutes is distinct from old.duration_minutes or new.response_required is distinct from old.response_required then
      new.version := old.version + 1;
    end if;
    if old.status = 'published' and new.status <> 'published' and exists (
      select 1 from public.improvement_path_activities a
      join public.improvement_path_steps s on s.id = a.step_id
      join public.improvement_paths p on p.id = s.path_id
      where a.exercise_id = old.id and p.status = 'published') then
      raise exception 'این تمرین در مسیر منتشرشده استفاده شده است؛ ابتدا آن مسیر را به پیش‌نویس برگردانید' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_improvement_exercise_guard on public.improvement_exercises;
create trigger trg_improvement_exercise_guard before insert or update on public.improvement_exercises
  for each row execute function public.improvement_exercise_guard();

create or replace function public.improvement_exercise_before_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.user_plan_activities a join public.user_improvement_plans p on p.id = a.plan_id
             where a.exercise_id = old.id and p.status in ('pending','active','paused')) then
    raise exception 'این تمرین در برنامه‌ی فعال کاربران استفاده شده و حذف نمی‌شود؛ آن را آرشیو کنید' using errcode = '23503';
  end if;
  return old;
end $$;
drop trigger if exists trg_improvement_exercise_delete on public.improvement_exercises;
create trigger trg_improvement_exercise_delete before delete on public.improvement_exercises
  for each row execute function public.improvement_exercise_before_delete();

-- مسیر: انتشار و نسخه فقط از RPC؛ محتوای مسیر منتشرشده فقط‌خواندنی
create or replace function public.improvement_path_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare via_rpc boolean := coalesce(pg_catalog.current_setting('app.path_publish', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.status := 'draft'; new.version := 0; new.published_at := null; new.created_by := auth.uid(); end if;
    return new;
  end if;
  if auth.uid() is not null and not via_rpc then
    if new.status is distinct from old.status and new.status = 'published' then
      raise exception 'انتشار مسیر فقط از دکمه‌ی «انتشار» و پس از اعتبارسنجی انجام می‌شود' using errcode = '42501';
    end if;
    new.version := old.version; new.published_at := old.published_at;
    if old.status = 'published' and new.status = 'published'
       and (to_jsonb(new) - 'updated_at' - 'updated_by' - 'sort_order') is distinct from (to_jsonb(old) - 'updated_at' - 'updated_by' - 'sort_order') then
      raise exception 'مسیر منتشرشده قابل ویرایش نیست؛ ابتدا آن را به پیش‌نویس برگردانید (برنامه‌های در حال اجرای کاربران تغییر نمی‌کنند)' using errcode = '23514';
    end if;
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists trg_improvement_path_guard on public.improvement_paths;
create trigger trg_improvement_path_guard before insert or update on public.improvement_paths
  for each row execute function public.improvement_path_guard();

create or replace function public.improvement_path_before_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.user_improvement_plans p where p.path_id = old.id and p.status in ('pending','active','paused')) then
    raise exception 'کاربرانی برنامه‌ی باز از این مسیر دارند؛ مسیر را آرشیو کنید' using errcode = '23503';
  end if;
  return old;
end $$;
drop trigger if exists trg_improvement_path_delete on public.improvement_paths;
create trigger trg_improvement_path_delete before delete on public.improvement_paths
  for each row execute function public.improvement_path_before_delete();

-- مراحل و فعالیت‌ها: وقتی مسیر منتشرشده است تغییر نمی‌کنند؛ روز مرحله در بازه‌ی مدت مسیر باشد
create or replace function public.improvement_step_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_path uuid; v_status public.publish_status; v_days int;
begin
  v_path := case when tg_op = 'DELETE' then old.path_id else new.path_id end;
  select status, duration_days into v_status, v_days from public.improvement_paths where id = v_path;
  if auth.uid() is not null and v_status = 'published' then
    raise exception 'مسیر منتشرشده قابل ویرایش نیست؛ ابتدا آن را به پیش‌نویس برگردانید' using errcode = '23514';
  end if;
  if tg_op <> 'DELETE' and new.day_number > v_days then
    raise exception 'روز مرحله از مدت مسیر (% روز) بیشتر است', v_days using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists trg_improvement_step_guard on public.improvement_path_steps;
create trigger trg_improvement_step_guard before insert or update or delete on public.improvement_path_steps
  for each row execute function public.improvement_step_guard();

create or replace function public.improvement_activity_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_step uuid; v_status public.publish_status;
begin
  v_step := case when tg_op = 'DELETE' then old.step_id else new.step_id end;
  select p.status into v_status from public.improvement_path_steps s join public.improvement_paths p on p.id = s.path_id where s.id = v_step;
  if auth.uid() is not null and v_status = 'published' then
    raise exception 'مسیر منتشرشده قابل ویرایش نیست؛ ابتدا آن را به پیش‌نویس برگردانید' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists trg_improvement_activity_guard on public.improvement_path_activities;
create trigger trg_improvement_activity_guard before insert or update or delete on public.improvement_path_activities
  for each row execute function public.improvement_activity_guard();

-- ═══════════════ موتور قواعد ═══════════════

-- اعتبارسنجی ساختار شرط‌ها (یک سطح گروه تو در تو مجاز است)
create or replace function public.rec_validate_conditions(p_mode text, p_conditions jsonb, p_depth int default 0)
returns void language plpgsql immutable set search_path = '' as $$
declare c jsonb; v1 numeric; v2 numeric; n int := 0;
begin
  if p_mode not in ('all','any') then raise exception 'حالت ترکیب شرط‌ها باید AND یا OR باشد' using errcode = '22023'; end if;
  if p_conditions is null or jsonb_typeof(p_conditions) <> 'array' then raise exception 'شرط‌ها باید فهرست باشند' using errcode = '22023'; end if;
  if jsonb_array_length(p_conditions) not between 1 and 20 then raise exception 'تعداد شرط‌ها باید بین ۱ تا ۲۰ باشد' using errcode = '22023'; end if;
  for c in select * from jsonb_array_elements(p_conditions) loop
    n := n + 1;
    if jsonb_typeof(c) <> 'object' then raise exception 'شرط نامعتبر است' using errcode = '22023'; end if;
    if c ? 'conditions' then
      if p_depth >= 1 then raise exception 'گروه شرط فقط یک سطح تو در تو پشتیبانی می‌شود' using errcode = '22023'; end if;
      perform public.rec_validate_conditions(coalesce(c->>'mode', 'all'), c->'conditions', p_depth + 1);
    else
      if coalesce(c->>'metric', '') not in ('total','dimension') then raise exception 'نوع معیار باید نمره‌ی کل یا بُعد باشد' using errcode = '22023'; end if;
      if c->>'metric' = 'dimension' and char_length(btrim(coalesce(c->>'dimension', ''))) = 0 then raise exception 'نام بُعد را وارد کنید' using errcode = '22023'; end if;
      if coalesce(c->>'op', '') not in ('eq','gt','gte','lt','lte','between','exists','not_exists') then raise exception 'عملگر شرط نامعتبر است' using errcode = '22023'; end if;
      if c->>'op' not in ('exists','not_exists') then
        begin v1 := (c->>'value')::numeric; exception when others then raise exception 'مقدار شرط باید عدد باشد' using errcode = '22023'; end;
        if v1 is null then raise exception 'مقدار شرط باید عدد باشد' using errcode = '22023'; end if;
        if c->>'op' = 'between' then
          begin v2 := (c->>'value2')::numeric; exception when others then raise exception 'سقف بازه باید عدد باشد' using errcode = '22023'; end;
          if v2 is null or v2 < v1 then raise exception 'سقف بازه باید بزرگ‌تر یا مساوی کف بازه باشد' using errcode = '22023'; end if;
        end if;
      end if;
    end if;
  end loop;
end $$;

create or replace function public.improvement_rule_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.rec_validate_conditions(new.condition_mode, new.conditions, 0);
  if new.version_id is not null and not exists (select 1 from public.test_versions v where v.id = new.version_id and v.test_id = new.test_id) then
    raise exception 'نسخه‌ی انتخاب‌شده متعلق به این آزمون نیست' using errcode = '23514';
  end if;
  if auth.uid() is not null then
    if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists trg_improvement_rule_guard on public.improvement_recommendation_rules;
create trigger trg_improvement_rule_guard before insert or update on public.improvement_recommendation_rules
  for each row execute function public.improvement_rule_guard();

-- ارزیابی شرط‌ها؛ خروجی: {matched, details[]} (توضیح‌پذیر)
create or replace function public.rec_eval_conditions(p_mode text, p_conditions jsonb, p_total numeric, p_dims jsonb, p_depth int default 0)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  c jsonb; passed boolean; any_pass boolean := false; all_pass boolean := true; n int := 0;
  details jsonb := '[]'::jsonb; sub jsonb; val numeric; v1 numeric; v2 numeric; op text; lbl text; dim text;
begin
  for c in select * from jsonb_array_elements(p_conditions) loop
    n := n + 1;
    if c ? 'conditions' then
      sub := public.rec_eval_conditions(coalesce(c->>'mode', 'all'), c->'conditions', p_total, p_dims, p_depth + 1);
      passed := (sub->>'matched')::boolean;
      details := details || jsonb_build_array(jsonb_build_object('type', 'group', 'mode', coalesce(c->>'mode', 'all'), 'passed', passed, 'items', sub->'details'));
    else
      op := c->>'op';
      if c->>'metric' = 'total' then
        val := p_total; lbl := 'نمره‌ی کل';
      else
        dim := c->>'dimension'; lbl := 'بُعد «' || dim || '»';
        val := case when jsonb_typeof(p_dims->dim) = 'number' then (p_dims->>dim)::numeric end;
      end if;
      v1 := nullif(c->>'value', '')::numeric; v2 := nullif(c->>'value2', '')::numeric;
      passed := case op
        when 'exists' then val is not null
        when 'not_exists' then val is null
        when 'eq' then coalesce(val = v1, false)
        when 'gt' then coalesce(val > v1, false)
        when 'gte' then coalesce(val >= v1, false)
        when 'lt' then coalesce(val < v1, false)
        when 'lte' then coalesce(val <= v1, false)
        when 'between' then coalesce(val >= v1 and val <= v2, false)
        else false end;
      details := details || jsonb_build_array(jsonb_build_object('type', 'condition', 'label', lbl, 'metric', c->>'metric', 'dimension', c->>'dimension',
        'op', op, 'expected', v1, 'expected2', v2, 'actual', val, 'passed', passed));
    end if;
    any_pass := any_pass or passed; all_pass := all_pass and passed;
  end loop;
  return jsonb_build_object('matched', case when n = 0 then false when p_mode = 'any' then any_pass else all_pass end, 'details', details);
end $$;

-- اجرای قواعد برای یک نتیجه؛ مشترک بین تولید واقعی پیشنهاد و ابزار آزمایش مدیر
-- اولویت: priority بالاتر اول. «قطعی» پس از تطبیق، قواعد کم‌اولویت‌تر را متوقف می‌کند.
-- مسیر تکراری، مسیرهای هم‌گروه (exclusive_group) و مسیرهای پیش‌نویس/آرشیو پیشنهاد نمی‌شوند. سقف: ۳ پیشنهاد.
create or replace function public.rec_run_rules(p_test_id uuid, p_version_id uuid, p_total numeric, p_dims jsonb, p_include_inactive boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r record; ev jsonb; matched boolean; outcome text; reason text;
  entries jsonb := '[]'::jsonb; suggested jsonb := '[]'::jsonb;
  seen_paths uuid[] := '{}'; seen_groups text[] := '{}'; stop boolean := false; picked int := 0; max_picks constant int := 3;
begin
  for r in
    select rr.*, p.status as path_status, p.title as path_title, p.exclusive_group as xgroup
    from public.improvement_recommendation_rules rr
    join public.improvement_paths p on p.id = rr.path_id
    where rr.test_id = p_test_id
      and (rr.version_id is null or rr.version_id is not distinct from p_version_id)
      and (rr.is_active or p_include_inactive)
    order by rr.priority desc, rr.created_at asc, rr.id asc
  loop
    ev := public.rec_eval_conditions(r.condition_mode, r.conditions, p_total, p_dims, 0);
    matched := (ev->>'matched')::boolean;
    if not matched then outcome := 'not_matched';
    elsif not r.is_active then outcome := 'inactive_rule';
    elsif stop then outcome := 'skipped_after_definite';
    elsif r.path_status <> 'published' then outcome := 'path_not_published';
    elsif r.path_id = any(seen_paths) then outcome := 'duplicate_path';
    elsif r.xgroup is not null and r.xgroup = any(seen_groups) then outcome := 'conflict_group';
    elsif picked >= max_picks then outcome := 'limit_reached';
    else
      outcome := 'suggested'; picked := picked + 1;
      seen_paths := seen_paths || r.path_id;
      if r.xgroup is not null then seen_groups := seen_groups || r.xgroup; end if;
      if r.strength = 'definite' then stop := true; end if;
      reason := coalesce(nullif(btrim(r.user_note), ''), 'بر اساس نتیجه‌ی همین آزمون برای شما مناسب به نظر می‌رسد.');
      suggested := suggested || jsonb_build_array(jsonb_build_object('rule_id', r.id, 'path_id', r.path_id, 'rank', picked,
        'strength', r.strength, 'reason', reason, 'explanation', ev->'details'));
    end if;
    entries := entries || jsonb_build_array(jsonb_build_object('rule_id', r.id, 'rule_title', r.title, 'priority', r.priority,
      'strength', r.strength, 'is_active', r.is_active, 'path_id', r.path_id, 'path_title', r.path_title, 'path_status', r.path_status,
      'matched', matched, 'outcome', outcome, 'details', ev->'details'));
  end loop;
  return jsonb_build_object('entries', entries, 'suggested', suggested);
end $$;

-- تولید پیشنهاد از «نتیجه‌ی واقعی ذخیره‌شده» (نه از ورودی کلاینت)
create or replace function public.generate_improvement_recommendations(p_attempt_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare res public.test_results; out jsonb;
begin
  select * into res from public.test_results where attempt_id = p_attempt_id;
  if res.attempt_id is null then return; end if;
  out := public.rec_run_rules(res.test_id, res.version_id, res.total_score, res.dimension_scores, false);
  delete from public.improvement_recommendations where attempt_id = p_attempt_id and status = 'suggested';
  insert into public.improvement_recommendations (user_id, attempt_id, rule_id, path_id, rank, strength, reason, explanation)
  select res.user_id, p_attempt_id, (e->>'rule_id')::uuid, (e->>'path_id')::uuid, (e->>'rank')::int, e->>'strength', e->>'reason', e->'explanation'
  from jsonb_array_elements(out->'suggested') e
  on conflict (attempt_id, path_id) do nothing;
end $$;

-- پس از ثبت نتیجه؛ هیچ خطایی نباید ثبت نتیجه‌ی آزمون را مختل کند
create or replace function public.trg_improvement_recommend_after_result()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform public.generate_improvement_recommendations(new.attempt_id);
  exception when others then
    null;
  end;
  return new;
end $$;
drop trigger if exists trg_improvement_recommend_after_result on public.test_results;
create trigger trg_improvement_recommend_after_result after insert on public.test_results
  for each row execute function public.trg_improvement_recommend_after_result();

-- ═══════════════ شاخص‌های برنامه (همه از داده‌ی واقعی) ═══════════════
create or replace function public.improvement_plan_metrics(p_plan_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  pl public.user_improvement_plans; today date := (now() at time zone 'Asia/Tehran')::date;
  total int; done int; skipped int; req_total int; req_done int; due_total int; due_done int; planned int; idx int; pct int; adh int;
begin
  select * into pl from public.user_improvement_plans where id = p_plan_id;
  if pl.id is null then return null; end if;
  select count(*), count(*) filter (where a.status = 'completed'), count(*) filter (where a.status = 'skipped'),
         count(*) filter (where a.is_required), count(*) filter (where a.is_required and a.status = 'completed')
    into total, done, skipped, req_total, req_done from public.user_plan_activities a where a.plan_id = pl.id;
  planned := coalesce((select max(day_number) from public.user_plan_steps where plan_id = pl.id), 1);
  idx := greatest((today - (pl.started_at at time zone 'Asia/Tehran')::date) + 1, 1);
  select count(*) filter (where a.status <> 'skipped'), count(*) filter (where a.status = 'completed')
    into due_total, due_done
    from public.user_plan_activities a join public.user_plan_steps s on s.id = a.plan_step_id
    where a.plan_id = pl.id and s.day_number <= idx;
  pct := case when total - skipped <= 0 then 0 else round(100.0 * done / (total - skipped)) end;
  adh := case when due_total = 0 then null else round(100.0 * due_done / due_total) end;
  return jsonb_build_object('total', total, 'completed', done, 'skipped', skipped, 'required_total', req_total, 'required_completed', req_done,
    'percent', pct, 'due_total', due_total, 'due_completed', due_done, 'adherence', adh, 'day_index', idx, 'planned_days', planned);
end $$;

-- ═══════════════ RPC کاربر ═══════════════
create or replace function public.result_path_recommendations(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.improvement_user_ok() then raise exception 'حساب فعال و تأییدشده لازم است' using errcode = '42501'; end if;
  if not exists (select 1 from public.test_results where attempt_id = p_attempt_id and user_id = auth.uid()) then
    raise exception 'نتیجه‌ی آزمون یافت نشد' using errcode = '42501';
  end if;
  perform public.generate_improvement_recommendations(p_attempt_id);   -- بر اساس قواعد فعالِ همین لحظه، idempotent
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'attempt_id', x.attempt_id, 'path_id', p.id, 'title', p.title, 'description', coalesce(p.user_description, p.description),
      'goal', p.goal, 'duration_days', p.duration_days, 'reason', x.reason, 'strength', x.strength, 'rank', x.rank, 'status', x.status,
      'plan_id', (select pl.id from public.user_improvement_plans pl where pl.user_id = auth.uid() and pl.path_id = p.id and pl.status in ('active','paused','pending') limit 1))
      order by x.rank)
    from public.improvement_recommendations x join public.improvement_paths p on p.id = x.path_id
    where x.attempt_id = p_attempt_id and x.user_id = auth.uid() and p.status = 'published'), '[]'::jsonb);
end $$;

create or replace function public.my_path_recommendations()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.improvement_user_ok() then raise exception 'حساب فعال و تأییدشده لازم است' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(t.j order by t.created_at desc) from (
      select distinct on (x.path_id) x.created_at, jsonb_build_object('id', x.id, 'attempt_id', x.attempt_id, 'test_id', tr.test_id, 'path_id', p.id,
        'title', p.title, 'description', coalesce(p.user_description, p.description), 'goal', p.goal, 'duration_days', p.duration_days,
        'reason', x.reason, 'strength', x.strength, 'status', x.status,
        'plan_id', (select pl.id from public.user_improvement_plans pl where pl.user_id = auth.uid() and pl.path_id = p.id and pl.status in ('active','paused','pending') limit 1)) as j
      from public.improvement_recommendations x
      join public.improvement_paths p on p.id = x.path_id and p.status = 'published'
      join public.test_results tr on tr.attempt_id = x.attempt_id
      where x.user_id = auth.uid()
      order by x.path_id, x.created_at desc
    ) t limit 6), '[]'::jsonb);
end $$;

create or replace function public.get_improvement_path_detail(p_path_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p public.improvement_paths;
begin
  if not public.improvement_user_ok() then raise exception 'حساب فعال و تأییدشده لازم است' using errcode = '42501'; end if;
  select * into p from public.improvement_paths where id = p_path_id and status = 'published';
  if p.id is null then raise exception 'مسیر در دسترس نیست' using errcode = 'P0002'; end if;
  return jsonb_build_object('id', p.id, 'title', p.title, 'description', coalesce(p.user_description, p.description), 'goal', p.goal, 'topic', p.topic,
    'duration_days', p.duration_days, 'version', p.version,
    'steps', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'day_number', s.day_number, 'title', s.title, 'description', s.description,
        'activities', coalesce((select jsonb_agg(jsonb_build_object('title', e.title, 'goal', e.goal, 'duration_minutes', e.duration_minutes,
            'exercise_type', e.exercise_type, 'is_required', a.is_required, 'suggested_time', a.suggested_time) order by a.sort_order, a.created_at)
          from public.improvement_path_activities a join public.improvement_exercises e on e.id = a.exercise_id where a.step_id = s.id), '[]'::jsonb))
        order by s.day_number, s.sort_order, s.created_at)
      from public.improvement_path_steps s where s.path_id = p.id), '[]'::jsonb));
end $$;

create or replace function public.start_improvement_plan(p_path_id uuid, p_attempt_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); p public.improvement_paths; v_plan uuid; v_max int; v_attempt uuid := null;
  stp record; v_step uuid; act record;
begin
  if not public.improvement_user_ok() then raise exception 'حساب فعال و تأییدشده لازم است' using errcode = '42501'; end if;
  select * into p from public.improvement_paths where id = p_path_id and status = 'published';
  if p.id is null then raise exception 'این مسیر در حال حاضر در دسترس نیست' using errcode = 'P0002'; end if;
  if p_attempt_id is not null and exists (select 1 from public.test_results where attempt_id = p_attempt_id and user_id = v_uid) then v_attempt := p_attempt_id; end if;
  if exists (select 1 from public.user_improvement_plans where user_id = v_uid and path_id = p.id and status in ('active','paused','pending')) then
    raise exception 'برنامه‌ی بازی از این مسیر دارید؛ آن را ادامه دهید' using errcode = '23505';
  end if;
  if exists (select 1 from public.user_improvement_plans where user_id = v_uid and status = 'active') then
    raise exception 'ابتدا مسیر فعال فعلی را متوقف یا تکمیل کنید' using errcode = '23505';
  end if;
  select max(day_number) into v_max from public.improvement_path_steps where path_id = p.id;
  if v_max is null or not exists (select 1 from public.improvement_path_activities a join public.improvement_path_steps st on st.id = a.step_id where st.path_id = p.id) then
    raise exception 'این مسیر هنوز فعالیتی ندارد' using errcode = '23514';
  end if;

  begin
    insert into public.user_improvement_plans (user_id, path_id, path_version, path_title, path_goal, source_attempt_id, status, planned_end_date)
    values (v_uid, p.id, p.version, p.title, p.goal, v_attempt, 'active', ((now() at time zone 'Asia/Tehran')::date + (v_max - 1)))
    returning id into v_plan;
  exception when unique_violation then
    raise exception 'ابتدا مسیر فعال فعلی را متوقف یا تکمیل کنید' using errcode = '23505';
  end;

  for stp in select * from public.improvement_path_steps where path_id = p.id order by day_number, sort_order, created_at loop
    insert into public.user_plan_steps (plan_id, day_number, title, description, sort_order) values (v_plan, stp.day_number, stp.title, stp.description, stp.sort_order) returning id into v_step;
    for act in select pa.*, e.title as e_title, e.goal as e_goal, e.instructions as e_instr, e.duration_minutes as e_dur, e.exercise_type as e_type,
                    e.content as e_content, e.response_required as e_req, e.version as e_ver
             from public.improvement_path_activities pa join public.improvement_exercises e on e.id = pa.exercise_id
             where pa.step_id = stp.id order by pa.sort_order, pa.created_at loop
      insert into public.user_plan_activities (plan_id, plan_step_id, exercise_id, exercise_version, title, goal, instructions, duration_minutes, exercise_type, content,
                                               response_required, is_required, suggested_time, sort_order)
      values (v_plan, v_step, act.exercise_id, act.e_ver, act.e_title, act.e_goal, act.e_instr, act.e_dur, act.e_type, act.e_content, act.e_req, act.is_required, act.suggested_time, act.sort_order);
    end loop;
  end loop;

  if v_attempt is not null then
    update public.improvement_recommendations set status = 'started' where user_id = v_uid and attempt_id = v_attempt and path_id = p.id;
  end if;
  return v_plan;
end $$;

create or replace function public.begin_plan_activity(p_activity_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.improvement_user_ok() then raise exception 'حساب فعال و تأییدشده لازم است' using errcode = '42501'; end if;
  update public.user_plan_activities a set status = 'in_progress', started_at = coalesce(a.started_at, now()), updated_at = now()
  from public.user_improvement_plans pl
  where a.id = p_activity_id and pl.id = a.plan_id and pl.user_id = auth.uid() and pl.status = 'active' and a.status = 'not_started';
  if not found and not exists (select 1 from public.user_plan_activities a join public.user_improvement_plans pl on pl.id = a.plan_id
                               where a.id = p_activity_id and pl.user_id = auth.uid()) then
    raise exception 'فعالیت یافت نشد' using errcode = '42501';
  end if;
end $$;

create or replace function public.complete_plan_activity(p_activity_id uuid, p_response jsonb default '{}'::jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.user_plan_activities; pl public.user_improvement_plans; clean jsonb; txt text; n int; mn int; mx int; r int; chk jsonb; i jsonb; items_n int;
begin
  if not public.improvement_user_ok() then raise exception 'حساب فعال و تأییدشده لازم است' using errcode = '42501'; end if;
  select x.* into a from public.user_plan_activities x join public.user_improvement_plans p on p.id = x.plan_id
   where x.id = p_activity_id and p.user_id = auth.uid() for update of x;
  if a.id is null then raise exception 'فعالیت یافت نشد' using errcode = '42501'; end if;
  select * into pl from public.user_improvement_plans where id = a.plan_id for update;
  if a.status = 'completed' then return public.improvement_plan_metrics(a.plan_id); end if;   -- idempotent: ثبت تکراری اثری ندارد
  if pl.status <> 'active' then raise exception 'این برنامه فعال نیست؛ ابتدا آن را از سر بگیرید' using errcode = '23514'; end if;
  if a.status = 'skipped' then raise exception 'این فعالیت رد شده است' using errcode = '23514'; end if;
  if p_note is not null and char_length(p_note) > 2000 then raise exception 'یادداشت بیش از حد طولانی است' using errcode = '22023'; end if;
  p_response := coalesce(p_response, '{}'::jsonb);
  if jsonb_typeof(p_response) <> 'object' then raise exception 'پاسخ نامعتبر است' using errcode = '22023'; end if;

  if a.exercise_type = 'reflection' then
    txt := btrim(coalesce(p_response->>'text', ''));
    if char_length(txt) > 5000 then raise exception 'متن بیش از ۵۰۰۰ کاراکتر است' using errcode = '22023'; end if;
    if a.response_required and char_length(txt) < 10 then raise exception 'برای ثبت این تمرین، پاسخ خود را (حداقل ۱۰ کاراکتر) بنویسید' using errcode = '22023'; end if;
    clean := jsonb_build_object('text', txt);
  elsif a.exercise_type = 'checklist' then
    items_n := jsonb_array_length(coalesce(a.content->'items', '[]'::jsonb));
    chk := coalesce(p_response->'checked', '[]'::jsonb);
    if jsonb_typeof(chk) <> 'array' then raise exception 'پاسخ چک‌لیست نامعتبر است' using errcode = '22023'; end if;
    n := 0;
    for i in select * from jsonb_array_elements(chk) loop
      if jsonb_typeof(i) <> 'number' or (i #>> '{}')::numeric <> trunc((i #>> '{}')::numeric) or (i #>> '{}')::int < 0 or (i #>> '{}')::int >= items_n then
        raise exception 'مورد چک‌لیست نامعتبر است' using errcode = '22023';
      end if;
    end loop;
    select count(distinct (v #>> '{}')::int) into n from jsonb_array_elements(chk) v;
    if n < items_n then raise exception 'همه‌ی موارد چک‌لیست باید انجام شده باشند' using errcode = '22023'; end if;
    clean := jsonb_build_object('checked', (select jsonb_agg(distinct (v #>> '{}')::int order by (v #>> '{}')::int) from jsonb_array_elements(chk) v));
  elsif a.exercise_type = 'rating' then
    mn := coalesce((a.content->>'min')::int, 1); mx := coalesce((a.content->>'max')::int, 5);
    if jsonb_typeof(p_response->'rating') <> 'number' or (p_response->>'rating')::numeric <> trunc((p_response->>'rating')::numeric) then
      raise exception 'یک امتیاز انتخاب کنید' using errcode = '22023';
    end if;
    r := (p_response->>'rating')::int;
    if r < mn or r > mx then raise exception 'امتیاز باید بین % و % باشد', mn, mx using errcode = '22023'; end if;
    clean := jsonb_build_object('rating', r);
  else
    raise exception 'نوع تمرین پشتیبانی نمی‌شود' using errcode = '22023';
  end if;

  update public.user_plan_activities set status = 'completed', response = clean, user_note = nullif(btrim(coalesce(p_note, '')), ''),
         started_at = coalesce(started_at, now()), completed_at = now(), updated_at = now()
   where id = a.id;

  if not exists (select 1 from public.user_plan_activities x where x.plan_id = a.plan_id and x.is_required and x.status not in ('completed','skipped')) then
    update public.user_improvement_plans set status = 'completed', completed_at = now() where id = a.plan_id and status = 'active';
  end if;
  return public.improvement_plan_metrics(a.plan_id);
end $$;

create or replace function public.skip_plan_activity(p_activity_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.user_plan_activities;
begin
  if not public.improvement_user_ok() then raise exception 'حساب فعال و تأییدشده لازم است' using errcode = '42501'; end if;
  select x.* into a from public.user_plan_activities x join public.user_improvement_plans p on p.id = x.plan_id
   where x.id = p_activity_id and p.user_id = auth.uid() and p.status = 'active' for update of x;
  if a.id is null then raise exception 'فعالیت یافت نشد یا برنامه فعال نیست' using errcode = '42501'; end if;
  if a.is_required then raise exception 'فعالیت الزامی قابل رد کردن نیست' using errcode = '23514'; end if;
  if a.status in ('completed','skipped') then return public.improvement_plan_metrics(a.plan_id); end if;
  update public.user_plan_activities set status = 'skipped', updated_at = now() where id = a.id;
  if not exists (select 1 from public.user_plan_activities x where x.plan_id = a.plan_id and x.is_required and x.status not in ('completed','skipped')) then
    update public.user_improvement_plans set status = 'completed', completed_at = now() where id = a.plan_id and status = 'active';
  end if;
  return public.improvement_plan_metrics(a.plan_id);
end $$;

create or replace function public.set_improvement_plan_status(p_plan_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare pl public.user_improvement_plans;
begin
  if not public.improvement_user_ok() then raise exception 'حساب فعال و تأییدشده لازم است' using errcode = '42501'; end if;
  select * into pl from public.user_improvement_plans where id = p_plan_id and user_id = auth.uid() for update;
  if pl.id is null then raise exception 'برنامه یافت نشد' using errcode = '42501'; end if;
  if p_status = 'paused' and pl.status = 'active' then
    update public.user_improvement_plans set status = 'paused', paused_at = now() where id = pl.id;
  elsif p_status = 'active' and pl.status = 'paused' then
    begin
      update public.user_improvement_plans set status = 'active', paused_at = null where id = pl.id;
    exception when unique_violation then
      raise exception 'ابتدا مسیر فعال فعلی را متوقف یا تکمیل کنید' using errcode = '23505';
    end;
  elsif p_status = 'cancelled' and pl.status in ('active','paused','pending') then
    update public.user_improvement_plans set status = 'cancelled', cancelled_at = now() where id = pl.id;
  else
    raise exception 'این تغییر وضعیت برای برنامه مجاز نیست' using errcode = '23514';
  end if;
end $$;

create or replace function public.my_improvement_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare act public.user_improvement_plans; m jsonb; idx int; today_list jsonb := '[]'::jsonb; overdue_list jsonb := '[]'::jsonb; overdue_n int := 0;
begin
  if not public.improvement_user_ok() then raise exception 'حساب فعال و تأییدشده لازم است' using errcode = '42501'; end if;
  select * into act from public.user_improvement_plans where user_id = auth.uid() and status = 'active' limit 1;
  if act.id is not null then
    m := public.improvement_plan_metrics(act.id); idx := (m->>'day_index')::int;
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'status', a.status, 'duration_minutes', a.duration_minutes, 'exercise_type', a.exercise_type,
             'is_required', a.is_required, 'suggested_time', a.suggested_time) order by s.sort_order, a.sort_order), '[]'::jsonb)
      into today_list from public.user_plan_activities a join public.user_plan_steps s on s.id = a.plan_step_id where a.plan_id = act.id and s.day_number = idx;
    select count(*), coalesce(jsonb_agg(j order by dn), '[]'::jsonb) into overdue_n, overdue_list from (
      select s.day_number as dn, jsonb_build_object('id', a.id, 'title', a.title, 'status', a.status, 'day_number', s.day_number, 'is_required', a.is_required) as j
      from public.user_plan_activities a join public.user_plan_steps s on s.id = a.plan_step_id
      where a.plan_id = act.id and s.day_number < idx and a.status in ('not_started','in_progress') order by s.day_number limit 10) q;
  end if;
  return jsonb_build_object(
    'active_plan', case when act.id is null then null else jsonb_build_object('id', act.id, 'path_id', act.path_id, 'title', act.path_title, 'goal', act.path_goal,
        'started_at', act.started_at, 'planned_end_date', act.planned_end_date, 'metrics', m, 'today', today_list, 'overdue', overdue_list, 'overdue_count', overdue_n) end,
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'path_id', p.path_id, 'title', p.path_title, 'status', p.status, 'started_at', p.started_at,
        'planned_end_date', p.planned_end_date, 'completed_at', p.completed_at, 'metrics', public.improvement_plan_metrics(p.id)) order by p.created_at desc)
      from public.user_improvement_plans p where p.user_id = auth.uid()), '[]'::jsonb));
end $$;

-- ═══════════════ RPC مدیریت ═══════════════
create or replace function public.set_improvement_path_status(p_path_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.improvement_paths; v_steps int; v_acts int; v_req int; v_bad int; v_unpub int;
begin
  if not public.has_permission('paths', 'publish') then raise exception 'دسترسی لازم برای انتشار مسیر وجود ندارد' using errcode = '42501'; end if;
  if p_status not in ('draft','published','archived') then raise exception 'وضعیت نامعتبر است' using errcode = '22023'; end if;
  select * into p from public.improvement_paths where id = p_path_id for update;
  if p.id is null then raise exception 'مسیر یافت نشد' using errcode = 'P0002'; end if;
  if p_status = 'published' then
    select count(*) into v_steps from public.improvement_path_steps where path_id = p.id;
    select count(*), count(*) filter (where a.is_required) into v_acts, v_req from public.improvement_path_activities a join public.improvement_path_steps s on s.id = a.step_id where s.path_id = p.id;
    select count(*) into v_bad from public.improvement_path_steps s where s.path_id = p.id and not exists (select 1 from public.improvement_path_activities a where a.step_id = s.id);
    select count(*) into v_unpub from public.improvement_path_activities a join public.improvement_path_steps s on s.id = a.step_id
      join public.improvement_exercises e on e.id = a.exercise_id where s.path_id = p.id and e.status <> 'published';
    if v_steps = 0 then raise exception 'مسیر باید حداقل یک مرحله داشته باشد' using errcode = '23514'; end if;
    if v_bad > 0 then raise exception '% مرحله بدون فعالیت وجود دارد', v_bad using errcode = '23514'; end if;
    if v_req = 0 then raise exception 'حداقل یک فعالیت الزامی لازم است' using errcode = '23514'; end if;
    if v_unpub > 0 then raise exception '% فعالیت به تمرین منتشرنشده وصل است', v_unpub using errcode = '23514'; end if;
    if p.status = 'published' then return; end if;
  end if;
  perform pg_catalog.set_config('app.path_publish', '1', true);
  update public.improvement_paths set status = p_status::public.publish_status,
         version = case when p_status = 'published' then version + 1 else version end,
         published_at = case when p_status = 'published' then now() else published_at end
   where id = p.id;
  perform pg_catalog.set_config('app.path_publish', '', true);
  perform public.write_audit('set_path_status', 'improvement_paths', p.id::text, 'success', jsonb_build_object('status', p_status));
end $$;

create or replace function public.admin_test_recommendation_rules(p_test_id uuid, p_version_id uuid, p_total numeric, p_dims jsonb default '{}'::jsonb, p_include_inactive boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('paths', 'read') then raise exception 'دسترسی لازم وجود ندارد' using errcode = '42501'; end if;
  if p_dims is null or jsonb_typeof(p_dims) <> 'object' then p_dims := '{}'::jsonb; end if;
  return public.rec_run_rules(p_test_id, p_version_id, p_total, p_dims, p_include_inactive);   -- چیزی ذخیره نمی‌شود
end $$;

create or replace function public.admin_improvement_overview(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d int := least(greatest(coalesce(p_days, 30), 1), 365); since timestamptz;
begin
  if not public.has_permission('paths', 'read') then raise exception 'دسترسی لازم وجود ندارد' using errcode = '42501'; end if;
  since := now() - make_interval(days => d);
  return jsonb_build_object(
    'period_days', d,
    'paths', (select jsonb_build_object('total', count(*), 'published', count(*) filter (where status = 'published'), 'draft', count(*) filter (where status = 'draft'),
                'archived', count(*) filter (where status = 'archived')) from public.improvement_paths),
    'exercises', (select jsonb_build_object('total', count(*), 'published', count(*) filter (where status = 'published')) from public.improvement_exercises),
    'rules', (select jsonb_build_object('total', count(*), 'active', count(*) filter (where is_active)) from public.improvement_recommendation_rules),
    'plans', (select jsonb_build_object('started_total', count(*), 'started_period', count(*) filter (where created_at >= since), 'active', count(*) filter (where status = 'active'),
                'completed', count(*) filter (where status = 'completed'), 'paused', count(*) filter (where status = 'paused'), 'cancelled', count(*) filter (where status = 'cancelled'),
                'completion_rate', case when count(*) = 0 then null else round(100.0 * count(*) filter (where status = 'completed') / count(*)) end)
              from public.user_improvement_plans),
    'activities', (select jsonb_build_object('assigned', count(*), 'completed', count(*) filter (where status = 'completed'),
                'completed_period', count(*) filter (where status = 'completed' and completed_at >= since),
                'completion_rate', case when count(*) filter (where status <> 'skipped') = 0 then null else round(100.0 * count(*) filter (where status = 'completed') / count(*) filter (where status <> 'skipped')) end)
              from public.user_plan_activities),
    'popular_paths', coalesce((select jsonb_agg(t order by t.plans desc) from (
        select coalesce(p.path_id::text, 'deleted') as path_id, max(p.path_title) as title, count(*) as plans, count(*) filter (where p.status = 'completed') as completed
        from public.user_improvement_plans p group by coalesce(p.path_id::text, 'deleted') order by count(*) desc limit 5) t), '[]'::jsonb),
    'popular_exercises', coalesce((select jsonb_agg(t order by t.completed desc) from (
        select coalesce(a.exercise_id::text, 'deleted') as exercise_id, max(a.title) as title, count(*) filter (where a.status = 'completed') as completed, count(*) as assigned
        from public.user_plan_activities a group by coalesce(a.exercise_id::text, 'deleted') order by count(*) filter (where a.status = 'completed') desc, count(*) desc limit 5) t), '[]'::jsonb),
    'dropoff', coalesce((select jsonb_agg(t order by t.count desc) from (
        select max(pl.path_title) as path_title, st.day_number, max(st.title) as step_title, count(*) as count
        from public.user_improvement_plans pl
        cross join lateral (select s.day_number, s.title from public.user_plan_steps s
                            where s.plan_id = pl.id and exists (select 1 from public.user_plan_activities a where a.plan_step_id = s.id and a.is_required and a.status not in ('completed','skipped'))
                            order by s.day_number, s.sort_order limit 1) st
        where pl.status in ('paused','cancelled')
        group by pl.path_id, st.day_number order by count(*) desc limit 8) t), '[]'::jsonb));
end $$;

-- ═══════════════ RLS و دسترسی‌ها ═══════════════
alter table public.improvement_exercises enable row level security;
alter table public.improvement_paths enable row level security;
alter table public.improvement_path_steps enable row level security;
alter table public.improvement_path_activities enable row level security;
alter table public.improvement_recommendation_rules enable row level security;
alter table public.improvement_recommendations enable row level security;
alter table public.user_improvement_plans enable row level security;
alter table public.user_plan_steps enable row level security;
alter table public.user_plan_activities enable row level security;

do $$
declare t text;
begin
  foreach t in array array['improvement_exercises','improvement_paths','improvement_path_steps','improvement_path_activities','improvement_recommendation_rules'] loop
    execute format('drop policy if exists %I on public.%I', t || '_staff_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_permission(''paths'',''read''))', t || '_staff_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_permission(''paths'',''write'')) with check (public.has_permission(''paths'',''write''))', t || '_staff_write', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- داده‌ی کاربر: فقط خود کاربر می‌خواند؛ نوشتن فقط از RPC (هیچ policy نوشتن وجود ندارد و حق نوشتن لغو شده است)
drop policy if exists improvement_recommendations_own on public.improvement_recommendations;
create policy improvement_recommendations_own on public.improvement_recommendations for select to authenticated using (user_id = auth.uid());
drop policy if exists user_plans_own on public.user_improvement_plans;
create policy user_plans_own on public.user_improvement_plans for select to authenticated using (user_id = auth.uid());
drop policy if exists user_plan_steps_own on public.user_plan_steps;
create policy user_plan_steps_own on public.user_plan_steps for select to authenticated
  using (exists (select 1 from public.user_improvement_plans p where p.id = plan_id and p.user_id = auth.uid()));
drop policy if exists user_plan_activities_own on public.user_plan_activities;
create policy user_plan_activities_own on public.user_plan_activities for select to authenticated
  using (exists (select 1 from public.user_improvement_plans p where p.id = plan_id and p.user_id = auth.uid()));
revoke all on public.improvement_recommendations, public.user_improvement_plans, public.user_plan_steps, public.user_plan_activities from anon, authenticated;
grant select on public.improvement_recommendations, public.user_improvement_plans, public.user_plan_steps, public.user_plan_activities to authenticated;

-- توابع: فقط authenticated؛ توابع داخلی برای هیچ نقش کلاینتی قابل‌اجرا نیستند
do $$
declare f text;
begin
  foreach f in array array[
    'improvement_user_ok()', 'result_path_recommendations(uuid)', 'my_path_recommendations()', 'get_improvement_path_detail(uuid)',
    'start_improvement_plan(uuid,uuid)', 'begin_plan_activity(uuid)', 'complete_plan_activity(uuid,jsonb,text)', 'skip_plan_activity(uuid)',
    'set_improvement_plan_status(uuid,text)', 'my_improvement_overview()', 'set_improvement_path_status(uuid,text)',
    'admin_test_recommendation_rules(uuid,uuid,numeric,jsonb,boolean)', 'admin_improvement_overview(integer)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array[
    'rec_validate_conditions(text,jsonb,integer)', 'rec_eval_conditions(text,jsonb,numeric,jsonb,integer)',
    'rec_run_rules(uuid,uuid,numeric,jsonb,boolean)', 'generate_improvement_recommendations(uuid)', 'improvement_plan_metrics(uuid)',
    'trg_improvement_recommend_after_result()', 'improvement_exercise_guard()', 'improvement_exercise_before_delete()',
    'improvement_path_guard()', 'improvement_path_before_delete()', 'improvement_step_guard()', 'improvement_activity_guard()', 'improvement_rule_guard()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- ═══════════════ حسابرسی، به‌روزرسانی زمان، مجوزها ═══════════════
do $$
declare t text;
begin
  foreach t in array array['improvement_exercises','improvement_paths','improvement_recommendation_rules'] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_updated', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', 'trg_' || t || '_updated', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row_change()', 'trg_' || t || '_audit', t);
  end loop;
end $$;

insert into public.role_permissions (role, resource, action) values
  ('admin','paths','read'),('admin','paths','write'),('admin','paths','publish'),
  ('test_manager','paths','read'),('test_manager','paths','write'),('test_manager','paths','publish'),
  ('content_manager','paths','read'),('psychology_reviewer','paths','read')
on conflict (role, resource, action) do nothing;

commit;
