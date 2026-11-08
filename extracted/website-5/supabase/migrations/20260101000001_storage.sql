-- ============================================================
-- آریاسازه — Storage و سیاست‌های فایل
-- ============================================================
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('site-media', 'site-media', true, 5242880,
    array['image/jpeg','image/png','image/webp','image/avif','application/pdf']),
  ('private-documents', 'private-documents', false, 10485760,
    array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- فایل‌های عمومی سایت: خواندن آزاد، نوشتن فقط با مجوز رسانه
drop policy if exists "site_media_public_read" on storage.objects;
create policy "site_media_public_read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'site-media');

drop policy if exists "site_media_staff_write" on storage.objects;
create policy "site_media_staff_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and public.has_permission('media','write'));

drop policy if exists "site_media_staff_update" on storage.objects;
create policy "site_media_staff_update" on storage.objects for update to authenticated
  using (bucket_id = 'site-media' and public.has_permission('media','write'))
  with check (bucket_id = 'site-media' and public.has_permission('media','write'));

drop policy if exists "site_media_staff_delete" on storage.objects;
create policy "site_media_staff_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and public.has_permission('media','write'));

-- اسناد خصوصی: هیچ دسترسی عمومی؛ فقط مجوز مدیریت مدارک
drop policy if exists "private_docs_read" on storage.objects;
create policy "private_docs_read" on storage.objects for select to authenticated
  using (bucket_id = 'private-documents' and public.has_permission('psychologists','manage_documents'));

drop policy if exists "private_docs_write" on storage.objects;
create policy "private_docs_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'private-documents' and public.has_permission('psychologists','manage_documents'));

drop policy if exists "private_docs_delete" on storage.objects;
create policy "private_docs_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'private-documents' and public.has_permission('psychologists','manage_documents'));

commit;
