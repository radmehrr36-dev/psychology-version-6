-- ============================================================
-- عملیات مدیریت کاربران: ثبت حسابرسی برای تغییر نوع حساب
-- تابع admin_set_account_kind از قبل وجود دارد؛ فقط با audit جایگزین می‌شود.
-- idempotent — داده را حذف نمی‌کند.
-- ============================================================
begin;

create or replace function public.admin_set_account_kind(p_user_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  if not public.has_permission('admins', 'write') then
    raise exception 'دسترسی لازم برای تغییر نوع حساب وجود ندارد' using errcode = '42501';
  end if;
  if p_kind not in ('user','psychologist','support_specialist') then
    raise exception 'نوع حساب نامعتبر است' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'تغییر نوع حساب خود مجاز نیست' using errcode = '42501';
  end if;
  select account_kind into v_old from public.profiles where id = p_user_id;
  if v_old is null then
    raise exception 'کاربر یافت نشد' using errcode = 'P0002';
  end if;
  update public.profiles set account_kind = p_kind where id = p_user_id;
  perform public.write_audit(
    'set_account_kind', 'profiles', p_user_id::text, 'success',
    jsonb_build_object('from', v_old, 'to', p_kind)
  );
end $$;

revoke all on function public.admin_set_account_kind(uuid, text) from public, anon;
grant execute on function public.admin_set_account_kind(uuid, text) to authenticated;

-- اطمینان از وجود ایندکس‌های یکتایی (اگر migration قبلی ناقص اعمال شده باشد)
create unique index if not exists profiles_username_key on public.profiles (lower(username)) where username is not null;
create unique index if not exists profiles_phone_key on public.profiles (phone) where phone is not null;

commit;
