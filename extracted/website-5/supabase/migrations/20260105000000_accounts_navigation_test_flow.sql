-- ============================================================
-- آریاسازه — حساب‌های کاربر/متخصص، ناوبری سایت، مسیر کامل آزمون
--   • account_kind روی profiles (user / psychologist) — نقش مدیریتی جدا می‌ماند
--   • psychologists.user_id: اتصال پروفایل عمومی متخصص به حساب او
--   • درخواست همکاری متخصص با وضعیت بررسی (psychologist_applications)
--   • منوی هدر/فوتر قابل مدیریت (site_navigation) + تنظیمات فوتر در site_settings
--   • اجرای آزمون: پاسخ‌ها خصوصی، امتیاز سمت سرور، تفسیر از snapshot نسخه
-- وابستگی: 20260104000000_dashboard_control_center.sql (test_attempts, user_activity_days)
-- ============================================================
begin;

-- ── نوع حساب ─────────────────────────────────────────────────
alter table public.profiles
  add column if not exists account_kind text not null default 'user'
    check (account_kind in ('user','psychologist'));

-- ثبت‌نام عمومی: نوع حساب از metadata خوانده می‌شود؛ نقش مدیریتی هرگز از کلاینت تعیین نمی‌شود
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_kind text := 'user';
begin
  if coalesce(new.raw_user_meta_data->>'account_kind','') = 'psychologist' then v_kind := 'psychologist'; end if;
  insert into public.profiles (id, email, full_name, role, account_status, account_kind)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), null, 'active', v_kind)
  on conflict (id) do nothing;
  return new;
end $$;

-- کاربران موجودِ بدون نقش مدیریتی که به‌صورت pending مانده‌اند، فعال می‌شوند (مدیران دست‌نخورده)
update public.profiles set account_status = 'active'
where role is null and account_status = 'pending';

-- کاربر فقط می‌تواند نام/آواتار خودش را ویرایش کند؛ نقش، وضعیت و نوع حساب قفل است
create or replace function public.guard_profile_self_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or new.id <> auth.uid() then return new; end if;
  if public.has_permission('admins','write') then return new; end if;
  if new.role is distinct from old.role
     or new.account_status is distinct from old.account_status
     or new.account_kind is distinct from old.account_kind
     or new.email is distinct from old.email then
    raise exception 'تغییر نقش، وضعیت یا نوع حساب از این مسیر مجاز نیست' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_profile_self_guard on public.profiles;
create trigger trg_profile_self_guard before update on public.profiles
  for each row execute function public.guard_profile_self_update();

-- ── اتصال متخصص به حساب ──────────────────────────────────────
alter table public.psychologists add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists psychologists_user_id_key on public.psychologists (user_id) where user_id is not null;

-- متخصص پروفایل عمومی خودش را می‌بیند و فقط فیلدهای معرفی را ویرایش می‌کند
drop policy if exists psychologists_own_select on public.psychologists;
create policy psychologists_own_select on public.psychologists for select to authenticated
  using (user_id = auth.uid());
drop policy if exists psychologists_own_update on public.psychologists;
create policy psychologists_own_update on public.psychologists for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.guard_psychologist_self_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or old.user_id is distinct from auth.uid() then return new; end if;
  if public.has_permission('psychologists','write') then return new; end if;
  if new.verification_status is distinct from old.verification_status
     or new.is_active is distinct from old.is_active
     or new.user_id is distinct from old.user_id then
    raise exception 'وضعیت تأیید و نمایش عمومی فقط توسط مدیر تغییر می‌کند' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_psychologist_self_guard on public.psychologists;
create trigger trg_psychologist_self_guard before update on public.psychologists
  for each row execute function public.guard_psychologist_self_update();

-- ── درخواست همکاری متخصص ─────────────────────────────────────
create table if not exists public.psychologist_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  title text not null check (char_length(title) between 2 and 120),
  license_number text check (license_number is null or char_length(license_number) <= 80),
  degree text,
  specialties text[] not null default '{}',
  years_experience integer check (years_experience is null or years_experience between 0 and 70),
  bio text check (bio is null or char_length(bio) <= 2000),
  status verification_status not null default 'pending',
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists psychologist_applications_user_key on public.psychologist_applications (user_id);
alter table public.psychologist_applications enable row level security;

drop policy if exists psy_app_own_select on public.psychologist_applications;
create policy psy_app_own_select on public.psychologist_applications for select to authenticated
  using (user_id = auth.uid() or public.has_permission('psychologists','read'));
drop policy if exists psy_app_own_insert on public.psychologist_applications;
create policy psy_app_own_insert on public.psychologist_applications for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and reviewed_by is null and review_note is null);
drop policy if exists psy_app_own_update on public.psychologist_applications;
create policy psy_app_own_update on public.psychologist_applications for update to authenticated
  using (user_id = auth.uid() and status in ('pending','rejected'))
  with check (user_id = auth.uid() and status = 'pending' and reviewed_by is null);
drop policy if exists psy_app_staff_update on public.psychologist_applications;
create policy psy_app_staff_update on public.psychologist_applications for update to authenticated
  using (public.has_permission('psychologists','write')) with check (public.has_permission('psychologists','write'));

drop trigger if exists trg_psy_app_updated on public.psychologist_applications;
create trigger trg_psy_app_updated before update on public.psychologist_applications
  for each row execute function public.touch_updated_at();

-- تصمیم مدیر: تأیید → ساخت/اتصال پروفایل عمومی (غیرفعال تا مدیر فعالش کند)
create or replace function public.review_psychologist_application(p_application_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.psychologist_applications; v_pid uuid;
begin
  if not public.has_permission('psychologists','write') then
    raise exception 'دسترسی لازم وجود ندارد' using errcode = '42501';
  end if;
  if p_decision not in ('verified','rejected') then raise exception 'تصمیم نامعتبر است'; end if;
  select * into a from public.psychologist_applications where id = p_application_id for update;
  if a is null then raise exception 'درخواست یافت نشد'; end if;

  update public.psychologist_applications
     set status = p_decision::verification_status, review_note = left(p_note, 1000),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_application_id;

  if p_decision = 'verified' then
    select id into v_pid from public.psychologists where user_id = a.user_id;
    if v_pid is null then
      insert into public.psychologists (display_name, title, bio, credentials_summary, verification_status, is_active, user_id, created_by)
      values (a.full_name, a.title, a.bio, nullif(concat_ws(' · ', a.degree, nullif(a.license_number,'')), ''), 'verified', false, a.user_id, auth.uid())
      returning id into v_pid;
    else
      update public.psychologists set verification_status = 'verified' where id = v_pid;
    end if;
    update public.profiles set account_kind = 'psychologist' where id = a.user_id;
  end if;

  perform public.write_audit(case when p_decision = 'verified' then 'approve' else 'reject' end,
    'psychologist_applications', p_application_id::text, 'success', jsonb_build_object('has_note', p_note is not null));
end $$;
revoke all on function public.review_psychologist_application(uuid, text, text) from public;
grant execute on function public.review_psychologist_application(uuid, text, text) to authenticated;

-- ── ناوبری سایت (هدر / فوتر) ─────────────────────────────────
create table if not exists public.site_navigation (
  id uuid primary key default gen_random_uuid(),
  location text not null check (location in ('header','footer_primary','footer_content','social')),
  label text not null check (char_length(label) between 1 and 60),
  href text not null check (char_length(href) between 1 and 300),
  icon text check (icon is null or icon in ('instagram','telegram','linkedin','x','youtube','whatsapp','mail','globe')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  open_in_new_tab boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists site_navigation_loc_idx on public.site_navigation (location, sort_order);
alter table public.site_navigation enable row level security;

drop policy if exists nav_public_read on public.site_navigation;
create policy nav_public_read on public.site_navigation for select to anon, authenticated using (is_active = true);
drop policy if exists nav_staff_read on public.site_navigation;
create policy nav_staff_read on public.site_navigation for select to authenticated using (public.has_permission('content','read'));
drop policy if exists nav_write on public.site_navigation;
create policy nav_write on public.site_navigation for all to authenticated
  using (public.has_permission('content','write')) with check (public.has_permission('content','write'));

drop trigger if exists trg_site_navigation_updated on public.site_navigation;
create trigger trg_site_navigation_updated before update on public.site_navigation for each row execute function public.touch_updated_at();
drop trigger if exists trg_site_navigation_audit on public.site_navigation;
create trigger trg_site_navigation_audit after insert or update or delete on public.site_navigation
  for each row execute function public.audit_row_change();

-- Seed: همان منوی فعلی سایت (فقط اگر خالی باشد)
insert into public.site_navigation (location, label, href, sort_order)
select * from (values
  ('header','خانه','/#top',1),('header','آزمون‌ها','/tests',2),('header','مقالات','/articles',3),
  ('header','متخصصان','/psychologists',4),('header','درباره ما','/#about',5),
  ('footer_primary','خانه','/',1),('footer_primary','آزمون‌ها','/tests',2),('footer_primary','نقشه‌ی رشد','/#map',3),
  ('footer_primary','مراحل کار','/#steps',4),('footer_primary','دستیار هوشمند','/#assistant',5),
  ('footer_content','مقالات','/articles',1),('footer_content','مجلات','/magazines',2),
  ('footer_content','کتاب‌ها و منابع','/books',3),('footer_content','کتابخانه','/library',4),('footer_content','متخصصان','/psychologists',5)
) as v(location,label,href,sort_order)
where not exists (select 1 from public.site_navigation);

insert into public.site_navigation (location, label, href, icon, sort_order, open_in_new_tab)
select * from (values
  ('social','اینستاگرام','https://instagram.com','instagram',1,true),
  ('social','تلگرام','https://telegram.org','telegram',2,true),
  ('social','لینکدین','https://linkedin.com','linkedin',3,true)
) as v(location,label,href,icon,sort_order,open_in_new_tab)
where not exists (select 1 from public.site_navigation where location = 'social');

insert into public.site_settings (key, value, is_public) values
  ('footer.general', '{"about":"آریاسازه پلتفرمی برای خودشناسی و رشد فردی است: آزمون‌های کوتاه، گزارش‌های شخصی، تمرین‌های روزانه و پیگیری پیشرفت، با تکیه بر دانش روان‌شناسی و همراهی متخصصان.","email":"salam@ariasazeh.ir","copyright":"© ۲۰۲۵ آریاسازه، تمامی حقوق محفوظ است.","disclaimer":"محتوای این وب‌سایت جایگزین مشاوره‌ی تخصصی نیست.","showSupportButton":true,"showAdminLink":true}'::jsonb, true)
on conflict (key) do nothing;

-- ── مسیر آزمون: پاسخ‌ها و نتیجه ─────────────────────────────
-- پاسخ‌ها فقط برای خود کاربر قابل خواندن‌اند و هیچ سیاست مدیریتی ندارند.
create table if not exists public.test_answers (
  attempt_id uuid not null references public.test_attempts(id) on delete cascade,
  question_id uuid not null,
  option_ids uuid[] not null default '{}',
  answered_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);
alter table public.test_answers enable row level security;
drop policy if exists answers_own_select on public.test_answers;
create policy answers_own_select on public.test_answers for select to authenticated
  using (exists (select 1 from public.test_attempts a where a.id = attempt_id and a.user_id = auth.uid()));
-- نوشتن فقط از طریق تابع (بدون policy insert/update برای کلاینت)

create table if not exists public.test_results (
  attempt_id uuid primary key references public.test_attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  test_id uuid not null references public.tests(id) on delete cascade,
  version_id uuid references public.test_versions(id) on delete set null,
  total_score numeric not null,
  min_score numeric,
  max_score numeric,
  dimension_scores jsonb not null default '{}'::jsonb,
  interpretation jsonb not null default '{}'::jsonb,   -- {label, description, dimension} از snapshot نسخه
  computed_at timestamptz not null default now()
);
create index if not exists test_results_user_idx on public.test_results (user_id, computed_at desc);
alter table public.test_results enable row level security;
drop policy if exists results_own_select on public.test_results;
create policy results_own_select on public.test_results for select to authenticated using (user_id = auth.uid());
drop policy if exists results_own_delete on public.test_results;
create policy results_own_delete on public.test_results for delete to authenticated using (user_id = auth.uid());

-- شروع آزمون (نسخه‌ی منتشرشده‌ی همان آزمون انتخاب می‌شود؛ تلاش ناتمام قبلی ادامه می‌یابد)
create or replace function public.start_test_attempt(p_test_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_version uuid; v_attempt uuid;
begin
  if v_uid is null then raise exception 'برای شروع آزمون وارد شوید' using errcode = '42501'; end if;
  select v.id into v_version from public.test_versions v
   join public.tests t on t.id = v.test_id
   where v.test_id = p_test_id and v.status = 'published' and v.snapshot is not null
     and t.status = 'published' and t.review_status = 'approved'
   order by v.published_at desc nulls last limit 1;
  if v_version is null then raise exception 'نسخه‌ی منتشرشده‌ای برای این آزمون وجود ندارد'; end if;

  select id into v_attempt from public.test_attempts
   where user_id = v_uid and test_id = p_test_id and version_id = v_version and status = 'started'
   order by started_at desc limit 1;
  if v_attempt is not null then return v_attempt; end if;

  insert into public.test_attempts (test_id, version_id, user_id, status)
  values (p_test_id, v_version, v_uid, 'started') returning id into v_attempt;
  return v_attempt;
end $$;

-- ذخیره‌ی یک پاسخ (اعتبارسنجی سؤال و گزینه‌ها بر اساس snapshot نسخه)
create or replace function public.save_test_answer(p_attempt_id uuid, p_question_id uuid, p_option_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare a public.test_attempts; snap jsonb; q jsonb; v_type text; v_valid int;
begin
  select * into a from public.test_attempts where id = p_attempt_id and user_id = auth.uid();
  if a is null then raise exception 'تلاش آزمون یافت نشد' using errcode = '42501'; end if;
  if a.status <> 'started' then raise exception 'این آزمون قبلاً پایان یافته است'; end if;

  select snapshot into snap from public.test_versions where id = a.version_id;
  select x into q from jsonb_array_elements(snap->'questions') x where (x->>'id')::uuid = p_question_id;
  if q is null then raise exception 'سؤال متعلق به این نسخه نیست'; end if;
  v_type := q->>'type';

  if array_length(p_option_ids, 1) is null then raise exception 'پاسخ خالی است'; end if;
  if v_type in ('single_choice','likert') and array_length(p_option_ids, 1) <> 1 then
    raise exception 'این سؤال فقط یک گزینه می‌پذیرد';
  end if;
  select count(*) into v_valid from jsonb_array_elements(q->'options') o
   where (o->>'id')::uuid = any(p_option_ids);
  if v_valid <> array_length(p_option_ids, 1) then raise exception 'گزینه‌ی نامعتبر'; end if;

  insert into public.test_answers (attempt_id, question_id, option_ids)
  values (p_attempt_id, p_question_id, p_option_ids)
  on conflict (attempt_id, question_id) do update set option_ids = excluded.option_ids, answered_at = now();
end $$;

-- پایان آزمون: بررسی سؤال‌های الزامی، محاسبه‌ی امتیاز (sum/average، کل و ابعاد) و انتخاب تفسیر از snapshot
create or replace function public.complete_test_attempt(p_attempt_id uuid)
returns public.test_results language plpgsql security definer set search_path = public as $$
declare
  a public.test_attempts; snap jsonb; rules jsonb; method text;
  v_total numeric := 0; v_count int := 0; v_min numeric := 0; v_max numeric := 0;
  dims jsonb := '{}'::jsonb; dim_counts jsonb := '{}'::jsonb;
  q jsonb; ans record; opt jsonb; v_dim text; v_score numeric; v_qmin numeric; v_qmax numeric;
  interp jsonb := '{}'::jsonb; r public.test_results; missing int;
begin
  select * into a from public.test_attempts where id = p_attempt_id and user_id = auth.uid() for update;
  if a is null then raise exception 'تلاش آزمون یافت نشد' using errcode = '42501'; end if;
  if a.status = 'completed' then
    select * into r from public.test_results where attempt_id = p_attempt_id; return r;
  end if;

  select snapshot, scoring_rules into snap, rules from public.test_versions where id = a.version_id;
  method := coalesce(rules->>'method', 'sum');

  select count(*) into missing from jsonb_array_elements(snap->'questions') x
   where coalesce((x->>'is_required')::boolean, true)
     and not exists (select 1 from public.test_answers ta where ta.attempt_id = p_attempt_id and ta.question_id = (x->>'id')::uuid);
  if missing > 0 then raise exception 'هنوز % سؤال الزامی بی‌پاسخ است', missing; end if;

  for q in select x from jsonb_array_elements(snap->'questions') x loop
    v_dim := coalesce(nullif(q->>'dimension',''), 'total');
    select min((o->>'score')::numeric), max((o->>'score')::numeric) into v_qmin, v_qmax from jsonb_array_elements(q->'options') o;
    v_min := v_min + coalesce(v_qmin, 0); v_max := v_max + coalesce(v_qmax, 0);

    select * into ans from public.test_answers where attempt_id = p_attempt_id and question_id = (q->>'id')::uuid;
    if ans is null then continue; end if;
    v_score := 0;
    for opt in select o from jsonb_array_elements(q->'options') o where (o->>'id')::uuid = any(ans.option_ids) loop
      v_score := v_score + coalesce((opt->>'score')::numeric, 0);
    end loop;
    v_total := v_total + v_score; v_count := v_count + 1;
    dims := jsonb_set(dims, array[v_dim], to_jsonb(coalesce((dims->>v_dim)::numeric, 0) + v_score));
    dim_counts := jsonb_set(dim_counts, array[v_dim], to_jsonb(coalesce((dim_counts->>v_dim)::int, 0) + 1));
  end loop;

  if method = 'average' and v_count > 0 then
    v_total := round(v_total / v_count, 2);
    select coalesce(jsonb_object_agg(key, round((value::text)::numeric / nullif((dim_counts->>key)::numeric,0), 2)), '{}'::jsonb) into dims from jsonb_each(dims);
  end if;

  -- تفسیر: اولویت با بازه‌ی بعد total، بر اساس امتیاز کل
  select to_jsonb(i) into interp from (
    select x->>'label' as label, x->>'description' as description, coalesce(x->>'dimension','total') as dimension
    from jsonb_array_elements(coalesce(snap->'interpretations','[]'::jsonb)) x
    where coalesce(x->>'dimension','total') = 'total'
      and v_total between (x->>'min_score')::numeric and (x->>'max_score')::numeric
    order by (x->>'sort_order')::int nulls last limit 1
  ) i;

  insert into public.test_results (attempt_id, user_id, test_id, version_id, total_score, min_score, max_score, dimension_scores, interpretation)
  values (p_attempt_id, a.user_id, a.test_id, a.version_id, v_total,
          case when method = 'average' then null else v_min end,
          case when method = 'average' then null else v_max end,
          dims, coalesce(interp, '{}'::jsonb))
  on conflict (attempt_id) do update set total_score = excluded.total_score, dimension_scores = excluded.dimension_scores,
    interpretation = excluded.interpretation, computed_at = now()
  returning * into r;

  update public.test_attempts set status = 'completed', completed_at = now() where id = p_attempt_id;
  return r;
end $$;

create or replace function public.abandon_test_attempt(p_attempt_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.test_attempts set status = 'abandoned'
   where id = p_attempt_id and user_id = auth.uid() and status = 'started';
end $$;

revoke all on function public.start_test_attempt(uuid) from public;
revoke all on function public.save_test_answer(uuid, uuid, uuid[]) from public;
revoke all on function public.complete_test_attempt(uuid) from public;
revoke all on function public.abandon_test_attempt(uuid) from public;
grant execute on function public.start_test_attempt(uuid) to authenticated;
grant execute on function public.save_test_answer(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.complete_test_attempt(uuid) to authenticated;
grant execute on function public.abandon_test_attempt(uuid) to authenticated;

-- ── آمار روزانه/ماهانه برای داشبورد مدیریت ───────────────────
create or replace function public.admin_active_users()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Tehran')::date;
begin
  if not public.has_permission('users','read') then
    raise exception 'دسترسی لازم وجود ندارد' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'dau', (select count(distinct user_id) from public.user_activity_days where day = today),
    'dau_prev', (select count(distinct user_id) from public.user_activity_days where day = today - 1),
    'mau', (select count(distinct user_id) from public.user_activity_days where day > today - 30),
    'mau_prev', (select count(distinct user_id) from public.user_activity_days where day > today - 60 and day <= today - 30),
    'tracking_since', (select min(day) from public.user_activity_days)
  );
end $$;
revoke all on function public.admin_active_users() from public;
grant execute on function public.admin_active_users() to authenticated;

commit;
