-- ============================================================
-- آریاسازه — مرکز کنترل داشبورد (توسعه‌ی سازگار، بدون تغییر مخرب)
--
-- شامل:
--   • ترجیحات شخصی مدیر                 (admin_preferences)
--   • وضعیت خوانده‌شدن اعلان‌ها           (admin_notification_reads)
--   • رخدادهای آزمون (فقط وضعیت، بدون پاسخ)  (test_attempts)
--   • فعالیت روزانه‌ی کاربران              (user_activity_days)
--   • فیلدهای کیفیت علمی آزمون            (ستون‌های جدید tests)
--   • توابع تجمیعی امن برای داشبورد
--
-- حریم خصوصی: هیچ پاسخ یا نتیجه‌ی روان‌شناختی ذخیره نمی‌شود؛ مدیران فقط
-- آمار تجمیعی را از طریق توابع SECURITY DEFINER می‌بینند.
-- ============================================================
begin;

-- ── فیلدهای کیفیت علمی آزمون ─────────────────────────────────
alter table public.tests
  add column if not exists source_reference text,
  add column if not exists license_info text,
  add column if not exists review_due_at timestamptz;

-- ── ترجیحات مدیر ─────────────────────────────────────────────
create table if not exists public.admin_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb check (pg_column_size(preferences) < 8192),
  updated_at timestamptz not null default now()
);
alter table public.admin_preferences enable row level security;

drop policy if exists admin_prefs_select on public.admin_preferences;
create policy admin_prefs_select on public.admin_preferences for select to authenticated
  using (user_id = auth.uid() and public.current_app_role() is not null);
drop policy if exists admin_prefs_insert on public.admin_preferences;
create policy admin_prefs_insert on public.admin_preferences for insert to authenticated
  with check (user_id = auth.uid() and public.current_app_role() is not null);
drop policy if exists admin_prefs_update on public.admin_preferences;
create policy admin_prefs_update on public.admin_preferences for update to authenticated
  using (user_id = auth.uid() and public.current_app_role() is not null)
  with check (user_id = auth.uid() and public.current_app_role() is not null);

drop trigger if exists trg_admin_prefs_updated on public.admin_preferences;
create trigger trg_admin_prefs_updated before update on public.admin_preferences
  for each row execute function public.touch_updated_at();

-- ── اعلان‌های خوانده‌شده ─────────────────────────────────────
create table if not exists public.admin_notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null check (char_length(item_key) between 3 and 120),
  read_at timestamptz not null default now(),
  primary key (user_id, item_key)
);
alter table public.admin_notification_reads enable row level security;

drop policy if exists notif_reads_select on public.admin_notification_reads;
create policy notif_reads_select on public.admin_notification_reads for select to authenticated
  using (user_id = auth.uid() and public.current_app_role() is not null);
drop policy if exists notif_reads_insert on public.admin_notification_reads;
create policy notif_reads_insert on public.admin_notification_reads for insert to authenticated
  with check (user_id = auth.uid() and public.current_app_role() is not null);
drop policy if exists notif_reads_delete on public.admin_notification_reads;
create policy notif_reads_delete on public.admin_notification_reads for delete to authenticated
  using (user_id = auth.uid() and public.current_app_role() is not null);

-- ── رخدادهای آزمون (بدون پاسخ‌ها) ────────────────────────────
create table if not exists public.test_attempts (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests(id) on delete cascade,
  version_id uuid references public.test_versions(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'started' check (status in ('started','completed','abandoned')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check (completed_at is null or completed_at >= started_at)
);
create index if not exists test_attempts_started_idx on public.test_attempts (started_at);
create index if not exists test_attempts_test_idx on public.test_attempts (test_id, started_at);
alter table public.test_attempts enable row level security;

-- کاربر فقط رکورد خودش را می‌بیند؛ مدیران مستقیم نمی‌خوانند (فقط تجمیع از طریق تابع)
drop policy if exists attempts_own_select on public.test_attempts;
create policy attempts_own_select on public.test_attempts for select to authenticated
  using (user_id = auth.uid());
drop policy if exists attempts_own_insert on public.test_attempts;
create policy attempts_own_insert on public.test_attempts for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'started'
    and completed_at is null
    and exists (select 1 from public.tests t where t.id = test_id and t.status = 'published')
  );
drop policy if exists attempts_own_update on public.test_attempts;
create policy attempts_own_update on public.test_attempts for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and status in ('completed','abandoned'));

-- ── فعالیت روزانه‌ی کاربران ──────────────────────────────────
create table if not exists public.user_activity_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
create index if not exists user_activity_days_day_idx on public.user_activity_days (day);
alter table public.user_activity_days enable row level security;
-- عمداً هیچ policy ندارد: فقط توابع SECURITY DEFINER به آن دسترسی دارند.

-- ثبت آخرین بازدید (حداکثر هر ۱۰ دقیقه) و روز فعالیت
create or replace function public.touch_last_seen()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.user_activity_days (user_id, day)
  values (auth.uid(), (now() at time zone 'Asia/Tehran')::date)
  on conflict do nothing;
  update public.profiles
     set last_seen_at = now()
   where id = auth.uid()
     and (last_seen_at is null or last_seen_at < now() - interval '10 minutes');
end $$;
revoke all on function public.touch_last_seen() from public;
grant execute on function public.touch_last_seen() to authenticated;

-- ثبت رویداد حسابرسی فقط برای تغییرات معنادار پروفایل (نه last_seen_at)
drop trigger if exists trg_profiles_audit on public.profiles;
create trigger trg_profiles_audit after update on public.profiles
  for each row
  when (
    old.role is distinct from new.role
    or old.account_status is distinct from new.account_status
    or old.email is distinct from new.email
    or old.full_name is distinct from new.full_name
  )
  execute function public.audit_row_change();

-- ── توابع تجمیعی داشبورد ─────────────────────────────────────
create or replace function public.admin_dashboard_overview(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  t_start timestamptz := now() - make_interval(days => d);
  t_prev  timestamptz := now() - make_interval(days => d * 2);
  day_start date := ((now() - make_interval(days => d)) at time zone 'Asia/Tehran')::date;
  day_prev  date := ((now() - make_interval(days => d * 2)) at time zone 'Asia/Tehran')::date;
  res jsonb := '{}'::jsonb;
begin
  if public.current_app_role() is null then
    raise exception 'دسترسی مدیریتی وجود ندارد' using errcode = '42501';
  end if;

  if public.has_permission('users', 'read') then
    res := res || jsonb_build_object(
      'users_total',        (select count(*) from public.profiles),
      'users_new',          (select count(*) from public.profiles where created_at >= t_start),
      'users_new_prev',     (select count(*) from public.profiles where created_at >= t_prev and created_at < t_start),
      'users_active',       (select count(distinct user_id) from public.user_activity_days where day >= day_start),
      'users_active_prev',  (select count(distinct user_id) from public.user_activity_days where day >= day_prev and day < day_start)
    );
  end if;

  if public.has_permission('tests', 'read') then
    res := res || jsonb_build_object(
      'attempts_started',        (select count(*) from public.test_attempts where started_at >= t_start),
      'attempts_started_prev',   (select count(*) from public.test_attempts where started_at >= t_prev and started_at < t_start),
      'attempts_completed',      (select count(*) from public.test_attempts where status = 'completed' and completed_at >= t_start),
      'attempts_completed_prev', (select count(*) from public.test_attempts where status = 'completed' and completed_at >= t_prev and completed_at < t_start),
      'attempts_total',          (select count(*) from public.test_attempts)
    );
  end if;

  if public.has_permission('psychologists', 'read') then
    res := res || jsonb_build_object(
      'psychologists_active',
      (select count(*) from public.psychologists where is_active and verification_status = 'verified')
    );
  end if;

  return res;
end $$;

create or replace function public.admin_growth_series(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  today date := (now() at time zone 'Asia/Tehran')::date;
  res jsonb;
begin
  if not public.has_permission('users', 'read') then
    raise exception 'دسترسی لازم وجود ندارد' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.day), '[]'::jsonb) into res
  from (
    select g.day::date as day,
      (select count(*) from public.profiles p
        where (p.created_at at time zone 'Asia/Tehran')::date = g.day::date) as signups,
      (select count(*) from public.user_activity_days u where u.day = g.day::date) as active
    from generate_series(today - (d - 1), today, interval '1 day') as g(day)
  ) x;
  return res;
end $$;

create or replace function public.admin_test_activity(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  today date := (now() at time zone 'Asia/Tehran')::date;
  t_start timestamptz := now() - make_interval(days => d);
  v_series jsonb; v_popular jsonb; v_abandon jsonb; v_total bigint;
begin
  if not public.has_permission('tests', 'read') then
    raise exception 'دسترسی لازم وجود ندارد' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.day), '[]'::jsonb) into v_series
  from (
    select g.day::date as day,
      (select count(*) from public.test_attempts a
        where (a.started_at at time zone 'Asia/Tehran')::date = g.day::date) as started,
      (select count(*) from public.test_attempts a
        where a.status = 'completed' and (a.completed_at at time zone 'Asia/Tehran')::date = g.day::date) as completed
    from generate_series(today - (d - 1), today, interval '1 day') as g(day)
  ) x;

  select count(*) into v_total from public.test_attempts where started_at >= t_start;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_popular
  from (
    select t.id as test_id, t.title_fa as title, count(*) as attempts,
           count(*) filter (where a.status = 'completed') as completed
    from public.test_attempts a join public.tests t on t.id = a.test_id
    where a.started_at >= t_start
    group by t.id, t.title_fa
    order by count(*) desc, t.title_fa
    limit 6
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_abandon
  from (
    select t.id as test_id, t.title_fa as title, count(*) as started,
           count(*) filter (where a.status = 'completed') as completed
    from public.test_attempts a join public.tests t on t.id = a.test_id
    where a.started_at >= t_start
    group by t.id, t.title_fa
    having count(*) >= 3
    order by (count(*) filter (where a.status = 'completed'))::numeric / count(*) asc, count(*) desc
    limit 5
  ) x;

  return jsonb_build_object('series', v_series, 'popular', v_popular, 'abandonment', v_abandon, 'total_started', v_total);
end $$;

create or replace function public.admin_test_quality()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  if not public.has_permission('tests', 'read') then
    raise exception 'دسترسی لازم وجود ندارد' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.title), '[]'::jsonb) into res
  from (
    select t.id as test_id, t.slug, t.title_fa as title, t.status, t.review_status,
           t.scientific_lead, t.source_reference, t.license_info, t.review_due_at,
           lv.approved_at as last_review_at, lv.version_label,
           nullif(coalesce(nullif(p.full_name, ''), p.email), '') as reviewer_name
    from public.tests t
    left join lateral (
      select v.approved_at, v.approved_by, v.version_label
      from public.test_versions v
      where v.test_id = t.id and v.approved_at is not null
      order by v.approved_at desc limit 1
    ) lv on true
    left join public.profiles p on p.id = lv.approved_by
    where t.status <> 'archived'
    limit 200
  ) x;
  return res;
end $$;

revoke all on function public.admin_dashboard_overview(int) from public;
revoke all on function public.admin_growth_series(int) from public;
revoke all on function public.admin_test_activity(int) from public;
revoke all on function public.admin_test_quality() from public;
grant execute on function public.admin_dashboard_overview(int) to authenticated;
grant execute on function public.admin_growth_series(int) to authenticated;
grant execute on function public.admin_test_activity(int) to authenticated;
grant execute on function public.admin_test_quality() to authenticated;

commit;
