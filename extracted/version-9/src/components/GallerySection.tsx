import { motion } from "framer-motion";
import { ArrowLeft, Bookmark, Play } from "lucide-react";
import type { GalleryItem } from "../lib/siteData";

/**
 * بخش کاملاً قابل ویرایش «شناخت بهتر خود / بهتر شناخت خود»
 * هر آیتم خودش متن روی تصویر، تصویر و لینک مستقل دارد. صفر یا دو یا چند آیتم.
 */
export function GallerySection({ items, title, description }: { items: GalleryItem[]; title?: string; description?: string }) {
  if (!items || items.length === 0) return null;

  return (
    <section id="gallery-section" className="relative bg-cream pb-20 pt-20 md:pb-28 md:pt-28 scroll-mt-20">
      <div className="mx-auto max-w-[80rem] px-5">
        {(title || description) && (
          <div className="mb-10 max-w-2xl">
            {title && <h2 className="section-title mb-3">{title}</h2>}
            {description && <p className="section-lead">{description}</p>}
          </div>
        )}

        <div className={`grid gap-5 ${items.length === 1 ? "sm:grid-cols-1" : items.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
          {items.map((item, i) => (
            <motion.article
              key={item.id}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: Math.min(i * 0.06, 0.3), ease: "easeOut" }}
              className="group relative min-h-[300px] overflow-hidden rounded-[1.8rem] border border-ink/6 shadow-glass"
            >
              {/* تصویر */}
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.imageAlt ?? item.headline} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-pearl to-pearl-deep" aria-hidden="true" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/20 to-transparent" aria-hidden="true" />

              {/* نشان عمومی */}
              <span className="absolute right-4 top-4 rounded-full bg-white/80 px-3 py-1 text-[12px] font-bold text-steel backdrop-blur-sm">
                {i + 1 < 10 ? `0${i + 1}` : i + 1}
              </span>

              {/* محتوا پایین کارت */}
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-6">
                <div>
                  <h3 className="mb-1 text-[1.25rem] font-bold leading-[1.5] text-white">{item.headline}</h3>
                  {item.subline && <p className="text-[13px] font-medium text-white/85">{item.subline}</p>}
                  {item.actionLabel && item.actionHref && (
                    <a href={item.actionHref} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-[13px] font-bold text-ink transition-colors hover:bg-white">
                      {item.actionLabel}
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                {item.showPlay !== false && (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/85 text-steel shadow-soft transition-transform duration-300 group-hover:scale-105">
                    <Play className="h-4 w-4 -translate-x-px" fill="currentColor" />
                  </span>
                )}
              </div>

              {/* ذخیره‌سازی/نشانه‌ای ساده (نمایشی) */}
              <button
                type="button"
                aria-label={`ذخیره ${item.headline}`}
                className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-ink opacity-0 shadow-sm backdrop-blur transition-all duration-300 group-hover:opacity-100 focus:opacity-100 focus:outline-2 focus:outline-offset-2 focus:outline-steel"
              >
                <Bookmark className="h-4 w-4" />
              </button>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
