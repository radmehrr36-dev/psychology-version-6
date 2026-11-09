-- ============================================================
-- آریاسازه — بخش‌های استاندارد صفحه‌ی اصلی: ترتیب، گالری، شناخت بهتر خود
-- اجرای این فایل اختیاری است؛ همین بخش‌ها از داخل پنل (دکمه‌ی «افزودن بخش‌های استاندارد») هم ساخته می‌شوند.
-- ============================================================
begin;

insert into public.site_sections (key, name, status, sort_order, published_at, config, draft_config)
values
  ('layout', 'ترتیب بخش‌های صفحه‌ی اصلی', 'published', 0, now(),
   '{"order":[{"key":"hero","enabled":true},{"key":"testimonials","enabled":true},{"key":"cta","enabled":true},{"key":"tests","enabled":true},{"key":"steps","enabled":true},{"key":"gallery","enabled":true},{"key":"map","enabled":true}]}'::jsonb,
   '{"order":[{"key":"hero","enabled":true},{"key":"testimonials","enabled":true},{"key":"cta","enabled":true},{"key":"tests","enabled":true},{"key":"steps","enabled":true},{"key":"gallery","enabled":true},{"key":"map","enabled":true}]}'::jsonb),
  ('testimonials', 'بخش «شناخت بهتر خود»', 'published', 6, now(),
   '{"items":[{"id":"t1","headline":"آلبوم لحظه‌ها","subline":"قالب شخصی برای رسیدن به تعادل","imageUrl":"/images/map-card.jpg","imageAlt":"کوه‌های آرام در مه","actionLabel":"مشاهده","actionHref":"#map","showPlay":true},{"id":"t2","headline":"گذرنامه‌ی آرامش","subline":"برنامه‌ی متناسب با سبک خودت","imageUrl":"/images/map-card.jpg","imageAlt":"کوه‌های آرام در مه","actionLabel":"بیشتر","actionHref":"#tests","showPlay":true}]}'::jsonb,
   '{"items":[{"id":"t1","headline":"آلبوم لحظه‌ها","subline":"قالب شخصی برای رسیدن به تعادل","imageUrl":"/images/map-card.jpg","imageAlt":"کوه‌های آرام در مه","actionLabel":"مشاهده","actionHref":"#map","showPlay":true},{"id":"t2","headline":"گذرنامه‌ی آرامش","subline":"برنامه‌ی متناسب با سبک خودت","imageUrl":"/images/map-card.jpg","imageAlt":"کوه‌های آرام در مه","actionLabel":"بیشتر","actionHref":"#tests","showPlay":true}]}'::jsonb),
  ('gallery', 'گالری «بهتر شناخت خود، آغاز تغییر است»', 'published', 7, now(),
   '{"items":[]}'::jsonb,
   '{"items":[]}'::jsonb)
on conflict (key) do nothing;

commit;
