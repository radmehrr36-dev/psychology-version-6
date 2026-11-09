-- اجازه‌ی ویدیو در bucket عمومی برای امضای بصری هیرو و CTA
begin;

update storage.buckets
set allowed_mime_types = (
  select coalesce(array_agg(DISTINCT t), '{}')
  from unnest(coalesce(allowed_mime_types, '{}') || array['video/mp4','video/webm']) as t
)
where id = 'site-media';

commit;
