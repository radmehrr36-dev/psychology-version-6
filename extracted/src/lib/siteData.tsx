import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase, supabaseConfigured } from "./supabase";
import type { PublicTest } from "./types";

export interface CtaLink {
  label: string;
  href: string;
}

export interface HeroContent {
  eyebrow: string;
  titleLine1: string;
  titleLine2: string;
  description: string;
  primaryCta: CtaLink;
  secondaryCta: CtaLink;
  /** عکس یا ویدیو برای امضای بصری (کروی/نمایش تصویر/ویدیو) */
  mediaType?: "none" | "image" | "video";
  imageUrl?: string;
  videoUrl?: string;
}

export interface CtaContent {
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  /** ویژگی‌ها (۳ آیتم) */
  features: Array<{ label: string; icon: string }>; // icon: شناسه‌ی آیکون ساده
  /** تصویر پرو필 دستیار */
  avatarUrl?: string;
  /* عکس/ویدیوی اصلی بنر CTA (سمت چپ) */
  mediaType?: "none" | "image" | "video";
  mediaUrl?: string;
}

export const defaultHero: HeroContent = {
  eyebrow: "آریاسازه",
  titleLine1: "آرامش ذهن،",
  titleLine2: "آینده‌ای روشن‌تر",
  description:
    "آریاسازه، مسیری هوشمند برای شناخت بهتر خود. پرورش عادت‌های سالم‌تر و حرکت به‌سوی زندگی متعادل‌تر، با تکیه بر دانش روان‌شناسی، ابزارهای هوشمند و همراهی متخصصان.",
  primaryCta: { label: "شروع مسیر من", href: "/tests" },
  secondaryCta: { label: "آشنایی با آریاسازه", href: "#dashboard" },
};

export const defaultCta: CtaContent = {
  eyebrow: "دستیار هوشمند آریاسازه",
  title: "ترکیبی از علم، فناوری و همراهی انسان",
  description:
    "آریاسازه با ترکیب دانش روان‌شناسی، ابزارهای هوشمند و طراحی تجربه، مسیر شناخت و رشد فردی را ساده‌تر و قابل‌پیگیری می‌کند. پیشنهادهای هوشمند، مکمل نگاه متخصصان هستند، نه جایگزین آن.",
  ctaLabel: "شروع مسیر من",
  ctaHref: "#steps",
  features: [
    { label: "حریم خصوصی محافظت‌شده", icon: "lock" },
    { label: "تمرین‌های صوتی و تصویری", icon: "mic" },
    { label: "محتوای تهیه‌شده با همراهی متخصصان", icon: "award" },
  ],
};

export interface SectionOrderItem {
  key: "hero" | "dashboard" | "cta" | "tests" | "map" | "testimonials" | "steps" | "gallery" | "experts";
  enabled: boolean;
}

export interface GalleryItem {
  id: string;
  headline: string;
  subline: string;
  imageUrl?: string;
  imageAlt?: string;
  /** نوع لینک/اکشن کنار کارت */
  actionLabel?: string;
  actionHref?: string;
  /** فلش وسط پخش‌کننده‌ی نمایشی (نمونه) */
  showPlay?: boolean;
}

export const sectionOrderDefs: Record<SectionOrderItem["key"], { label: string }> = {
  hero: { label: "قهرمان (هیرو)" },
  dashboard: { label: "معرفی داشبورد شما" },
  experts: { label: "متخصصان و محتوای روان‌شناسی" },
  testimonials: { label: "بخش «شناخت بهتر خود»" },
  cta: { label: "بنر «ترکیبی از علم، فناوری و همراهی انسان»" },
  tests: { label: "کتابخانه‌ی آزمون‌ها" },
  map: { label: "نقشه‌ی رشد فردی" },
  steps: { label: "چگونه کار می‌کند؟" },
  gallery: { label: "گالری «بهتر شناخت خود، آغاز تغییر است»" },
};

interface SiteDataValue {
  loading: boolean;
  configured: boolean;
  error: string | null;
  hero: HeroContent;
  cta: CtaContent;
  testimonials: GalleryItem[]; // نقشه‌ی رشد / نمونه‌های «شناخت بهتر خود» (در کارت کنار نقشه)
  gallery: GalleryItem[];      // کارت‌های قابل حذف/افزودن «بهتر شناخت خود»
  sectionOrder: SectionOrderItem[];
  testsHeading: { label: string; title: string; description: string };
  stepsHeading: { label: string; title: string; description: string };
  tests: PublicTest[];
  /** db: داده از پایگاه داده، empty: پایگاه داده پیکربندی شده ولی آزمون منتشرشده ندارد، fallback: بدون بک‌اند */
  testsSource: "db" | "empty" | "fallback";
  seo: { title: string; description: string };
}

const defaultTestsHeading = {
  label: "آزمون‌های ما",
  title: "کتابخانه‌ی آزمون‌ها",
  description:
    "آزمون‌های کوتاه و کاربردی برای شناخت بهتر شخصیت، عادت‌ها، هیجان‌ها و سبک ارتباطی شما. فقط آزمون‌های منتشرشده و تأییدشده در این فهرست نمایش داده می‌شوند.",
};

const defaultStepsHeading = {
  label: "مسیر شما",
  title: "چگونه کار می‌کند؟",
  description: "از اولین آزمون تا پیگیری پیشرفت، پنج گام ساده و روشن.",
};

export const defaultStepsItems = [
  { step: 1, title: "کوچک شروع کن", subtitle: "فقط یک آزمون کوتاه" },
  { step: 2, title: "نتایج را بفهم", subtitle: "خلاصه‌ی خوانا، بدون پیچیدگی" },
  { step: 3, title: "چند تمرین امتحان کن", subtitle: "آهسته و منظم" },
];

export const defaultTestimonials: GalleryItem[] = [
  { id: "t1", headline: "آلبوم لحظه‌ها", subline: "قالب شخصی برای رسیدن به تعادل", imageUrl: "/images/map-card.jpg", actionLabel: "مشاهده", actionHref: "#map" },
  { id: "t2", headline: "گذرنامه‌ی آرامش", subline: "برنامه‌ی متناسب با سبک خودت", imageUrl: "/images/map-card.jpg", actionLabel: "بیشتر", actionHref: "#tests" },
];

export const defaultGallery: GalleryItem[] = [];

export const defaultSectionOrder: SectionOrderItem[] = [
  { key: "hero", enabled: true },
  { key: "dashboard", enabled: true },
  { key: "tests", enabled: true },
  { key: "map", enabled: true },
  { key: "steps", enabled: true },
  { key: "cta", enabled: true },
  { key: "experts", enabled: true },
  { key: "gallery", enabled: true },
  { key: "testimonials", enabled: true },
];

const fallbackSeo = {
  title: "آریاسازه | آرامش ذهن، آینده‌ای روشن‌تر",
  description: "آزمون‌های خودشناسی، گزارش‌های شخصی و تمرین‌های روزانه برای شناخت فردی.",
};

const SiteDataContext = createContext<SiteDataValue | null>(null);

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v : fallback;
}

function readCta(v: unknown, fallback: CtaLink): CtaLink {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return { label: asString(o.label, fallback.label), href: asString(o.href, fallback.href) };
  }
  return fallback;
}

function asMediaType(v: unknown, fallback?: "none" | "image" | "video") {
  return v === "none" || v === "image" || v === "video" ? v : fallback;
}

function asFeature(v: unknown): CtaContent["features"][0] | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const label = asString(o.label, "");
  const icon = asString(o.icon, "lock");
  return label ? { label, icon } : null;
}

function asGalleryItem(v: unknown, fallbackId: string): GalleryItem | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const headline = asString(o.headline, "");
  const subline = asString(o.subline, "");
  if (!headline) return null;
  return {
    id: asString(o.id, fallbackId),
    headline,
    subline,
    imageUrl: asString(o.imageUrl, ""),
    imageAlt: asString(o.imageAlt, ""),
    actionLabel: asString(o.actionLabel, ""),
    actionHref: asString(o.actionHref, ""),
    showPlay: typeof o.showPlay === "boolean" ? o.showPlay : undefined,
  };
}

export function SiteDataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(supabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [hero, setHero] = useState<HeroContent>(defaultHero);
  const [cta, setCta] = useState<CtaContent>(defaultCta);
  const [testimonials, setTestimonials] = useState<GalleryItem[]>(defaultTestimonials);
  const [gallery, setGallery] = useState<GalleryItem[]>(defaultGallery);
  const [sectionOrder, setSectionOrder] = useState<SectionOrderItem[]>(defaultSectionOrder);
  const [tests, setTests] = useState<PublicTest[]>([]);
  const [testsHeading, setTestsHeading] = useState(defaultTestsHeading);
  const [stepsHeading, setStepsHeading] = useState(defaultStepsHeading);
  const [testsSource, setTestsSource] = useState<"db" | "empty" | "fallback">(
    supabaseConfigured ? "empty" : "fallback"
  );
  const [seo, setSeo] = useState(fallbackSeo);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    (async () => {
      try {
        const [sections, testsRes, seoRes] = await Promise.all([
          supabase
            .from("site_sections")
            .select("key,config,sort_order,status")
            .eq("status", "published")
            .order("sort_order", { ascending: true }),
          supabase
            .from("tests")
            .select("id,slug,title_fa,short_description,duration_minutes,report_type,cover_url,scientific_lead,published_at,sort_order,category_id")
            .eq("status", "published")
            .eq("review_status", "approved")
            .order("sort_order", { ascending: true })
            .limit(24),
          supabase.from("site_settings").select("key,value").eq("key", "seo.default").maybeSingle(),
        ]);

        if (!testsRes.error && !sections.error) {
          const byKey = new Map<string, unknown>();
          for (const s of sections.data ?? []) byKey.set(s.key, s.config);

          const heroConfig = byKey.get("hero") as Record<string, unknown> | undefined;
          if (heroConfig) {
            setHero({
              eyebrow: asString(heroConfig.eyebrow, defaultHero.eyebrow),
              titleLine1: asString(heroConfig.titleLine1, defaultHero.titleLine1),
              titleLine2: asString(heroConfig.titleLine2, defaultHero.titleLine2),
              description: asString(heroConfig.description, defaultHero.description),
              primaryCta: readCta(heroConfig.primaryCta, defaultHero.primaryCta),
              secondaryCta: readCta(heroConfig.secondaryCta, defaultHero.secondaryCta),
              mediaType: asMediaType(heroConfig.mediaType, undefined),
              imageUrl: typeof heroConfig.imageUrl === "string" ? heroConfig.imageUrl : undefined,
              videoUrl: typeof heroConfig.videoUrl === "string" ? heroConfig.videoUrl : undefined,
            });
          }
          const testsHeadingConfig = byKey.get("tests-heading") as Record<string, unknown> | undefined;
          if (testsHeadingConfig) {
            setTestsHeading({
              label: asString(testsHeadingConfig.label, defaultTestsHeading.label),
              title: asString(testsHeadingConfig.title, defaultTestsHeading.title),
              description: asString(testsHeadingConfig.description, defaultTestsHeading.description),
            });
          }

          const stepsHeadingConfig = byKey.get("steps-heading") as Record<string, unknown> | undefined;
          if (stepsHeadingConfig) {
            setStepsHeading({
              label: asString(stepsHeadingConfig.label, defaultStepsHeading.label),
              title: asString(stepsHeadingConfig.title, defaultStepsHeading.title),
              description: asString(stepsHeadingConfig.description, defaultStepsHeading.description),
            });
          }

          const ctaConfig = byKey.get("cta") as Record<string, unknown> | undefined;
          if (ctaConfig) {
            const featsRaw = Array.isArray(ctaConfig.features) ? (ctaConfig.features as unknown[]) : defaultCta.features;
            const feats = featsRaw.map(asFeature).filter(Boolean) as CtaContent["features"];
            setCta({
              eyebrow: asString(ctaConfig.eyebrow, defaultCta.eyebrow),
              title: asString(ctaConfig.title, defaultCta.title),
              description: asString(ctaConfig.description, defaultCta.description),
              ctaLabel: asString(ctaConfig.ctaLabel, defaultCta.ctaLabel),
              ctaHref: asString(ctaConfig.ctaHref, defaultCta.ctaHref),
              features: feats.length ? feats : defaultCta.features,
              avatarUrl: typeof ctaConfig.avatarUrl === "string" ? ctaConfig.avatarUrl : undefined,
              mediaType: asMediaType(ctaConfig.mediaType, undefined),
              mediaUrl: typeof ctaConfig.mediaUrl === "string" ? ctaConfig.mediaUrl : undefined,
            });
          }

          const testimonialsRaw = byKey.get("testimonials") as Record<string, unknown> | undefined;
          if (testimonialsRaw && Array.isArray(testimonialsRaw.items)) {
            const items = (testimonialsRaw.items as unknown[])
              .map((v, i) => asGalleryItem(v, `t${i + 1}`))
              .filter(Boolean) as GalleryItem[];
            setTestimonials(items);
          }

          const galleryRaw = byKey.get("gallery") as Record<string, unknown> | undefined;
          if (galleryRaw && Array.isArray(galleryRaw.items)) {
            const items = (galleryRaw.items as unknown[])
              .map((v, i) => asGalleryItem(v, `g${i + 1}`))
              .filter(Boolean) as GalleryItem[];
            setGallery(items);
          } else if (!galleryRaw) {
            setGallery(defaultGallery);
          }

          const orderRaw = byKey.get("layout") as Record<string, unknown> | undefined;
          if (orderRaw && Array.isArray(orderRaw.order)) {
            const validKeys = new Set(Object.keys(sectionOrderDefs));
            const items = (orderRaw.order as unknown[])
              .map((v) => (typeof v === "string" ? { key: v, enabled: true } : v))
              .map((v) => v as { key?: string; enabled?: boolean })
              .filter((v) => v.key && validKeys.has(v.key));
            if (items.length) {
              setSectionOrder(items.map((v) => ({ key: v.key as SectionOrderItem["key"], enabled: v.enabled !== false })));
            }
          }

          let categoryNames = new Map<string, string>();
          const categoryIds = [...new Set((testsRes.data ?? []).map((t) => t.category_id).filter(Boolean))] as string[];
          if (categoryIds.length > 0) {
            const { data: cats } = await supabase.from("categories").select("id,name").in("id", categoryIds);
            categoryNames = new Map((cats ?? []).map((c) => [c.id as string, c.name as string]));
          }
          const mapped: PublicTest[] = (testsRes.data ?? []).map((t) => ({
            id: t.id,
            slug: t.slug,
            title: t.title_fa,
            description: t.short_description,
            duration_minutes: t.duration_minutes,
            report_type: t.report_type,
            categoryName: t.category_id ? categoryNames.get(t.category_id) ?? null : null,
            cover_url: t.cover_url,
            scientific_lead: t.scientific_lead,
            published_at: t.published_at,
          }));
          if (!cancelled) {
            setTests(mapped);
            setTestsSource(mapped.length > 0 ? "db" : "empty");
          }
        } else if (!cancelled) {
          setError("دریافت محتوای سایت از پایگاه داده ناموفق بود.");
          setTestsSource("fallback");
        }

        if (!seoRes.error && seoRes.data?.value && !cancelled) {
          const v = seoRes.data.value as Record<string, unknown>;
          setSeo({
            title: asString(v.title, fallbackSeo.title),
            description: asString(v.description, fallbackSeo.description),
          });
        }
      } catch {
        if (!cancelled) {
          setError("ارتباط با پایگاه داده برقرار نشد.");
          setTestsSource("fallback");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (seo.title) document.title = seo.title;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", seo.description);
  }, [seo]);

  const value = useMemo<SiteDataValue>(
    () => ({
      loading,
      configured: supabaseConfigured,
      error,
      hero,
      cta,
      testimonials,
      gallery,
      sectionOrder,
      testsHeading,
      stepsHeading,
      tests,
      testsSource,
      seo,
    }),
    [loading, error, hero, cta, testimonials, gallery, sectionOrder, testsHeading, stepsHeading, tests, testsSource, seo]
  );

  return <SiteDataContext.Provider value={value}>{children}</SiteDataContext.Provider>;
}

export function useSiteData(): SiteDataValue {
  const ctx = useContext(SiteDataContext);
  if (!ctx) throw new Error("useSiteData must be used inside SiteDataProvider");
  return ctx;
}
