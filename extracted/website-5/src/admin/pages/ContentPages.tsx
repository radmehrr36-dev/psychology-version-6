import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, Eye, LayoutTemplate, Plus, RefreshCw, Save, Send, Trash2, Undo2, X } from "lucide-react";
import { friendlyError, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { CrudPage, type CrudConfig } from "../CrudPage";
import {
  Button,
  Card,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  PublishBadge,
  formatDate,
  inputClass,
  useToast,
} from "../ui";
import type { SiteSection } from "../../lib/types";
import type { GalleryItem, SectionOrderItem } from "../../lib/siteData";
import { sectionOrderDefs, defaultSectionOrder, defaultTestimonials } from "../../lib/siteData";

const slugHint = "فقط حروف کوچک انگلیسی، عدد و خط تیره. در آدرس عمومی استفاده می‌شود.";
const statusOptions = [
  { label: "پیش‌نویس", value: "draft" },
  { label: "در بازبینی", value: "in_review" },
  { label: "منتشرشده", value: "published" },
  { label: "آرشیو", value: "archived" },
];

const articleConfig: CrudConfig = {
  table: "articles",
  title: "مقالات",
  description: "مقالات فارسی درباره‌ی خودشناسی، روان‌شناسی و رشد فردی. فقط مقالات منتشرشده در سایت عمومی دیده می‌شوند.",
  permission: "content",
  titleKey: "title",
  searchColumn: "title",
  orderBy: "created_at",
  publishable: true,
  filters: [{ column: "status", label: "وضعیت", options: statusOptions }],
  columns: [
    { key: "title", header: "مقاله", render: (r) => <div className="min-w-0"><p className="truncate text-[14px] font-bold text-ink">{String(r.title)}</p><p dir="ltr" className="truncate text-left text-[14px] text-body">/{String(r.slug)}</p></div> },
    { key: "author", header: "نویسنده", render: (r) => <span className="text-[14px] text-body">{String(r.author_name ?? "—")}</span> },
    { key: "published_at", header: "انتشار", render: (r) => <span className="whitespace-nowrap text-[14px] text-body">{formatDate(r.published_at as string | null)}</span> },
  ],
  fields: [
    { key: "title", label: "عنوان", required: true, span: 2 },
    { key: "slug", label: "slug", required: true, hint: slugHint },
    { key: "author_name", label: "نویسنده" },
    { key: "excerpt", label: "خلاصه", type: "textarea", rows: 3, span: 2, hint: "حداکثر ۳۰۰ کاراکتر پیشنهاد می‌شود." },
    { key: "body", label: "متن کامل", type: "textarea", rows: 8, span: 2, hint: "متن به‌صورت ساده (بدون HTML) نمایش داده می‌شود؛ بنابراین خطر XSS وجود ندارد." },
    { key: "category_id", label: "دسته‌بندی", type: "select" },
    { key: "cover_url", label: "آدرس تصویر شاخص", type: "url", placeholder: "https://…" },
    { key: "cover_alt", label: "متن جایگزین تصویر" },
    { key: "tags", label: "برچسب‌ها", type: "tags", hint: "با کاما جدا کنید." },
    { key: "status", label: "وضعیت انتشار", type: "select", options: statusOptions },
    { key: "review_status", label: "بازبینی محتوایی", type: "select", options: [
      { label: "در انتظار", value: "pending" },
      { label: "تأییدشده", value: "approved" },
      { label: "ردشده", value: "rejected" },
      { label: "نیاز ندارد", value: "not_required" },
    ] },
    { key: "seo_title", label: "SEO title" },
    { key: "seo_description", label: "SEO description", type: "textarea", rows: 2 },
  ],
  defaults: { status: "draft", review_status: "pending" },
};

const magazineConfig: CrudConfig = {
  table: "magazines",
  title: "مجلات",
  description: "شماره‌های مجله و فایل‌های منتشرشده. فایل‌های دارای حق نشر باید فقط با مجوز عمومی شوند.",
  permission: "content",
  titleKey: "title",
  searchColumn: "title",
  orderBy: "created_at",
  publishable: true,
  filters: [{ column: "status", label: "وضعیت", options: statusOptions }],
  columns: [
    { key: "title", header: "مجله", render: (r) => <div><p className="text-[14px] font-bold text-ink">{String(r.title)}</p><p dir="ltr" className="text-left text-[14px] text-body">/{String(r.slug)}</p></div> },
    { key: "issue", header: "شماره", render: (r) => <span className="text-[14px]">{String(r.issue_number ?? "—")}</span> },
    { key: "publisher", header: "ناشر", render: (r) => <span className="text-[14px] text-body">{String(r.publisher ?? "—")}</span> },
    { key: "published", header: "تاریخ انتشار", render: (r) => <span className="text-[14px] text-body">{formatDate(r.published_at as string | null)}</span> },
  ],
  fields: [
    { key: "title", label: "عنوان مجله", required: true, span: 2 },
    { key: "slug", label: "slug", required: true, hint: slugHint },
    { key: "issue_number", label: "شماره‌ی نسخه" },
    { key: "publisher", label: "ناشر" },
    { key: "description", label: "توضیحات", type: "textarea", rows: 4, span: 2 },
    { key: "cover_url", label: "تصویر جلد", type: "url" },
    { key: "cover_alt", label: "متن جایگزین جلد" },
    { key: "pdf_url", label: "آدرس فایل PDF", type: "url", hint: "فقط در صورت داشتن مجوز انتشار." },
    { key: "status", label: "وضعیت", type: "select", options: statusOptions },
    { key: "seo_title", label: "SEO title" },
    { key: "seo_description", label: "SEO description", type: "textarea", rows: 2, span: 2 },
  ],
  defaults: { status: "draft" },
};

const bookConfig: CrudConfig = {
  table: "books",
  title: "کتاب‌ها و منابع",
  description: "معرفی کتاب‌ها و منابع معتبر. فایل منابع خصوصی یا دارای حق نشر نباید عمومی شود.",
  permission: "content",
  titleKey: "title",
  searchColumn: "title",
  orderBy: "created_at",
  publishable: true,
  filters: [{ column: "status", label: "وضعیت", options: statusOptions }],
  columns: [
    { key: "title", header: "کتاب", render: (r) => <div><p className="text-[14px] font-bold text-ink">{String(r.title)}</p><p dir="ltr" className="text-left text-[14px] text-body">/{String(r.slug)}</p></div> },
    { key: "author", header: "نویسنده", render: (r) => <span className="text-[14px]">{String(r.author ?? "—")}</span> },
    { key: "resource", header: "منبع", render: (r) => <span className="text-[14px] text-body">{r.resource_is_public ? "عمومی" : "بدون فایل عمومی"}</span> },
    { key: "published", header: "انتشار", render: (r) => <span className="text-[14px] text-body">{formatDate(r.published_at as string | null)}</span> },
  ],
  fields: [
    { key: "title", label: "عنوان کتاب", required: true, span: 2 },
    { key: "slug", label: "slug", required: true, hint: slugHint },
    { key: "author", label: "نویسنده" },
    { key: "description", label: "توضیحات", type: "textarea", rows: 4, span: 2 },
    { key: "cover_url", label: "تصویر جلد", type: "url" },
    { key: "cover_alt", label: "متن جایگزین جلد" },
    { key: "publisher", label: "ناشر" },
    { key: "published_year", label: "سال انتشار", type: "number" },
    { key: "isbn", label: "ISBN" },
    { key: "category_id", label: "دسته‌بندی", type: "select" },
    { key: "resource_url", label: "آدرس منبع", type: "url" },
    { key: "resource_is_public", label: "منبع برای عموم قابل انتشار است", type: "checkbox", span: 2, hint: "فقط در صورت داشتن مجوز صریح فعال کنید." },
    { key: "status", label: "وضعیت", type: "select", options: statusOptions },
    { key: "seo_title", label: "SEO title" },
    { key: "seo_description", label: "SEO description", type: "textarea", rows: 2 },
  ],
  defaults: { status: "draft", resource_is_public: false },
};

export function ContentPages({ initialTab = "pages" }: { initialTab?: "pages" | "articles" | "magazines" | "books" }) {
  if (initialTab === "articles") return <CrudPage config={articleConfig} />;
  if (initialTab === "magazines") return <CrudPage config={magazineConfig} />;
  if (initialTab === "books") return <CrudPage config={bookConfig} />;
  return <PagesAndSections />;
}

/* ───────────────────────── صفحات و بخش‌ها ───────────────────────── */

const pageConfig: CrudConfig = {
  table: "pages",
  title: "صفحات سایت",
  description: "صفحات ثابت عمومی مانند «درباره ما» یا «حریم خصوصی». محتوای پیش‌نویس در سایت دیده نمی‌شود.",
  permission: "content",
  titleKey: "title",
  searchColumn: "title",
  orderBy: "sort_order",
  ascending: true,
  publishable: true,
  filters: [{ column: "status", label: "وضعیت", options: statusOptions }],
  columns: [
    { key: "title", header: "صفحه", render: (r) => <div><p className="text-[14px] font-bold text-ink">{String(r.title)}</p><p dir="ltr" className="text-left text-[14px] text-body">/{String(r.slug)}</p></div> },
    { key: "order", header: "ترتیب", render: (r) => <span className="text-[14px]">{String(r.sort_order ?? 0)}</span> },
    { key: "updated", header: "آخرین تغییر", render: (r) => <span className="text-[14px] text-body">{formatDate(r.updated_at as string | null)}</span> },
  ],
  fields: [
    { key: "title", label: "عنوان صفحه", required: true, span: 2 },
    { key: "slug", label: "slug", required: true, hint: slugHint },
    { key: "sort_order", label: "ترتیب نمایش", type: "number" },
    { key: "content", label: "متن صفحه", type: "textarea", rows: 10, span: 2, hint: "متن ساده؛ HTML اجرا نمی‌شود." },
    { key: "meta_description", label: "توضیحات متا", type: "textarea", rows: 2, span: 2 },
    { key: "seo_title", label: "SEO title" },
    { key: "social_image_url", label: "تصویر اجتماعی", type: "url" },
    { key: "status", label: "وضعیت", type: "select", options: statusOptions, span: 2 },
  ],
  defaults: { status: "draft", sort_order: 0 },
};

interface HeroDraft {
  eyebrow: string;
  titleLine1: string;
  titleLine2: string;
  description: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  mediaType: "none" | "image" | "video";
  imageUrl: string;
  videoUrl: string;
}

interface CtaDraft {
  eyebrow: string;
  title: string;
  description: string;
  mediaType: "none" | "image" | "video";
  mediaUrl: string;
  avatarUrl: string;
  features: Array<{ label: string; icon: string }>;
}

interface TextSectionDraft {
  label: string;
  title: string;
  description: string;
}

interface GalleryDraft {
  items: GalleryItem[];
}

interface LayoutDraft {
  order: SectionOrderItem[];
}

const sectionKeys = Object.keys(sectionOrderDefs) as Array<keyof typeof sectionOrderDefs>;

function extractHero(s: SiteSection): HeroDraft {
  const c = (s.draft_config ?? s.config ?? {}) as Record<string, unknown>;
  const p = (c.primaryCta ?? {}) as Record<string, unknown>;
  const sc = (c.secondaryCta ?? {}) as Record<string, unknown>;
  return {
    eyebrow: String(c.eyebrow ?? ""),
    titleLine1: String(c.titleLine1 ?? ""),
    titleLine2: String(c.titleLine2 ?? ""),
    description: String(c.description ?? ""),
    primaryLabel: String(p.label ?? ""),
    primaryHref: String(p.href ?? "#steps"),
    secondaryLabel: String(sc.label ?? ""),
    secondaryHref: String(sc.href ?? "#assistant"),
    mediaType: (c.mediaType as HeroDraft["mediaType"]) ?? "none",
    imageUrl: String(c.imageUrl ?? ""),
    videoUrl: String(c.videoUrl ?? ""),
  };
}

function extractCta(s: SiteSection): CtaDraft {
  const c = (s.draft_config ?? s.config ?? {}) as Record<string, unknown>;
  const feats = Array.isArray(c.features) ? (c.features as Array<Record<string, unknown>>) : [];
  return {
    eyebrow: String(c.eyebrow ?? ""),
    title: String(c.title ?? ""),
    description: String(c.description ?? ""),
    mediaType: (c.mediaType as CtaDraft["mediaType"]) ?? "none",
    mediaUrl: String(c.mediaUrl ?? ""),
    avatarUrl: String(c.avatarUrl ?? ""),
    features: feats.map((f) => ({ label: String(f.label ?? ""), icon: String(f.icon ?? "lock") })),
  };
}

function extractTextSection(s: SiteSection): TextSectionDraft {
  const c = (s.draft_config ?? s.config ?? {}) as Record<string, unknown>;
  return { label: String(c.label ?? ""), title: String(c.title ?? ""), description: String(c.description ?? "") };
}

function extractGallery(s: SiteSection): GalleryDraft {
  const c = (s.draft_config ?? s.config ?? {}) as Record<string, unknown>;
  const items = Array.isArray(c.items) ? (c.items as Array<Record<string, unknown>>) : [];
  return {
    items: items.map((x, i) => ({
      id: String(x.id ?? `g${i + 1}`),
      headline: String(x.headline ?? ""),
      subline: String(x.subline ?? ""),
      imageUrl: String(x.imageUrl ?? ""),
      imageAlt: String(x.imageAlt ?? ""),
      actionLabel: String(x.actionLabel ?? ""),
      actionHref: String(x.actionHref ?? ""),
      showPlay: typeof x.showPlay === "boolean" ? x.showPlay : undefined,
    })),
  };
}

function extractLayout(s: SiteSection): LayoutDraft {
  const c = (s.draft_config ?? s.config ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(c.order) ? (c.order as Array<{ key?: string; enabled?: boolean }>) : [];
  const items = raw
    .map((v) => (typeof v === "string" ? { key: v, enabled: true } : v))
    .filter((v): v is { key: string; enabled?: boolean } => typeof v === "object" && v !== null)
    .filter((v) => v.key && sectionKeys.includes(v.key as keyof typeof sectionOrderDefs))
    .map((v) => ({ key: v.key as SectionOrderItem["key"], enabled: v.enabled !== false }));
  return { order: items.length ? items : (sectionsOrderToKey(s, "enabled") ?? defaultOrder()) };
}

function sectionsOrderToKey(s: SiteSection, field: string): SectionOrderItem[] | null {
  const c = (s.draft_config ?? s.config ?? {}) as Record<string, unknown>;
  const raw = c[field];
  if (!Array.isArray(raw)) return null;
  return raw
    .map((v) => (typeof v === "string" ? { key: v, enabled: true } : v))
    .filter((v): v is { key: string; enabled?: boolean } => typeof v === "object" && v !== null)
    .filter((v) => v.key && sectionKeys.includes(v.key as keyof typeof sectionOrderDefs))
    .map((v) => ({ key: v.key as SectionOrderItem["key"], enabled: v.enabled !== false }));
}

function defaultOrder(): SectionOrderItem[] {
  return sectionKeys.map((k) => ({ key: k, enabled: true }));
}

function PagesAndSections() {
  const { can } = useAuth();
  const { notify } = useToast();
  const canWrite = can("content", "write");
  const [tab, setTab] = useState<"pages" | "sections">("sections");
  const [sections, setSections] = useState<SiteSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string>("");
  const [heroDraft, setHeroDraft] = useState<HeroDraft | null>(null);
  const [ctaDraft, setCtaDraft] = useState<CtaDraft | null>(null);
  const [textDraft, setTextDraft] = useState<TextSectionDraft | null>(null);
  const [galleryDraft, setGalleryDraft] = useState<GalleryDraft | null>(null);
  const [layoutDraft, setLayoutDraft] = useState<LayoutDraft | null>(null);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const active = useMemo(() => sections.find((s) => s.id === activeId) ?? null, [sections, activeId]);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.from("site_sections").select("*").order("sort_order");
    setLoading(false);
    if (err) {
      setError(friendlyError(err));
      return;
    }
    const rows = (data ?? []) as SiteSection[];
    setSections(rows);
    setActiveId((prev) => prev || rows[0]?.id || "");
  }, []);

  useEffect(() => { void load(); }, [load]);

  // بخش‌های استانداردی که هنوز در پایگاه داده ساخته نشده‌اند (ترتیب / گالری / شناخت بهتر خود)
  const standardSections: Array<{ key: string; name: string; sort_order: number; config: Record<string, unknown> }> = [
    { key: "layout", name: "ترتیب بخش‌های صفحه‌ی اصلی", sort_order: 0, config: { order: defaultSectionOrder } },
    { key: "testimonials", name: "بخش «شناخت بهتر خود»", sort_order: 6, config: { items: defaultTestimonials } },
    { key: "gallery", name: "گالری «بهتر شناخت خود، آغاز تغییر است»", sort_order: 7, config: { items: [] } },
  ];
  const missingSections = standardSections.filter((s) => !sections.some((r) => r.key === s.key));
  const [ensuring, setEnsuring] = useState(false);

  const ensureStandardSections = async () => {
    if (!supabase || missingSections.length === 0) return;
    setEnsuring(true);
    try {
      const now = new Date().toISOString();
      const rows = missingSections.map((s) => ({
        key: s.key,
        name: s.name,
        sort_order: s.sort_order,
        status: "published",
        published_at: now,
        config: s.config,
        draft_config: s.config,
      }));
      const { error: err } = await supabase.from("site_sections").insert(rows);
      if (err) throw err;
      notify("بخش‌های استاندارد ساخته شدند و در فهرست بخش‌ها قابل ویرایش‌اند.");
      await load();
    } catch (e) {
      notify(friendlyError(e), "error");
    } finally {
      setEnsuring(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    if (active.key === "hero") {
      setHeroDraft(extractHero(active));
      setCtaDraft(null); setTextDraft(null); setGalleryDraft(null); setLayoutDraft(null);
    } else if (active.key === "cta") {
      setCtaDraft(extractCta(active));
      setHeroDraft(null); setTextDraft(null); setGalleryDraft(null); setLayoutDraft(null);
    } else if (["tests-heading", "steps-heading"].includes(active.key)) {
      setTextDraft(extractTextSection(active));
      setHeroDraft(null); setCtaDraft(null); setGalleryDraft(null); setLayoutDraft(null);
    } else if (active.key === "gallery" || active.key === "testimonials") {
      setGalleryDraft(extractGallery(active));
      setHeroDraft(null); setCtaDraft(null); setTextDraft(null); setLayoutDraft(null);
    } else if (active.key === "layout") {
      setLayoutDraft(extractLayout(active));
      setHeroDraft(null); setCtaDraft(null); setTextDraft(null); setGalleryDraft(null);
    } else {
      setHeroDraft(null); setCtaDraft(null); setTextDraft(null); setGalleryDraft(null); setLayoutDraft(null);
    }
    setFormError(null);
  }, [active]);

  const validate = (): string | null => {
    if (active?.key === "hero" && heroDraft) {
      if (!heroDraft.titleLine1.trim() || !heroDraft.titleLine2.trim()) return "عنوان دوخطی الزامی است.";
      if (heroDraft.mediaType === "image" && !heroDraft.imageUrl.trim()) return "برای «تصویر» لازم است آدرس تصویر را وارد کنید.";
      if (heroDraft.mediaType === "video" && !heroDraft.videoUrl.trim()) return "برای «ویدیو» لازم است آدرس ویدیو را وارد کنید.";
    }
    if (active?.key === "cta" && ctaDraft) {
      if (!ctaDraft.title.trim() || !ctaDraft.description.trim()) return "عنوان و توضیح الزامی است.";
      if (ctaDraft.mediaType === "image" && !ctaDraft.mediaUrl.trim()) return "برای «تصویر» لازم است آدرس تصویر را وارد کنید.";
      if (ctaDraft.mediaType === "video" && !ctaDraft.mediaUrl.trim()) return "برای «ویدیو» لازم است آدرس ویدیو را وارد کنید.";
      if (ctaDraft.features.some((f) => !f.label.trim())) return "همه‌ی ویژگی‌ها باید متن داشته باشند.";
    }
    if ((active?.key === "gallery" || active?.key === "testimonials") && galleryDraft) {
      if (galleryDraft.items.some((x) => !x.headline.trim())) return "هر کارت باید حداقل عنوان بالای کارت داشته باشد.";
      if (galleryDraft.items.some((x) => x.imageUrl && !(x.imageAlt ?? "").trim())) return "اگر برای کارتی تصویر گذاشته‌اید، متن جایگزین تصویر را هم وارد کنید.";
    }
    if (active?.key === "layout" && layoutDraft) {
      const enabledCount = layoutDraft.order.filter((o) => o.enabled).length;
      if (enabledCount === 0) return "حداقل یک بخش باید فعال باشد.";
    }
    return null;
  };

  const buildDraft = (): Record<string, unknown> | null => {
    if (!active) return null;
    switch (active.key) {
      case "hero":
        return heroDraft ? {
          eyebrow: heroDraft.eyebrow,
          titleLine1: heroDraft.titleLine1,
          titleLine2: heroDraft.titleLine2,
          description: heroDraft.description,
          primaryCta: { label: heroDraft.primaryLabel, href: heroDraft.primaryHref },
          secondaryCta: { label: heroDraft.secondaryLabel, href: heroDraft.secondaryHref },
          mediaType: heroDraft.mediaType,
          imageUrl: heroDraft.imageUrl || undefined,
          videoUrl: heroDraft.videoUrl || undefined,
        } : null;
      case "cta":
        return ctaDraft ? {
          eyebrow: ctaDraft.eyebrow,
          title: ctaDraft.title,
          description: ctaDraft.description,
          mediaType: ctaDraft.mediaType,
          mediaUrl: ctaDraft.mediaUrl || undefined,
          avatarUrl: ctaDraft.avatarUrl || undefined,
          features: ctaDraft.features,
        } : null;
      case "tests-heading":
      case "steps-heading":
        return textDraft ? {
          label: textDraft.label,
          title: textDraft.title,
          description: textDraft.description,
        } : null;
      case "gallery":
      case "testimonials":
        return galleryDraft ? { items: galleryDraft.items } : null;
      case "layout":
        return layoutDraft ? { order: layoutDraft.order } : null;
      default:
        return null;
    }
  };

  const save = async (publish: boolean) => {
    if (!supabase || !active) return;
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }
    const draft = buildDraft();
    if (!draft) return;
    setSaving(publish ? "publish" : "draft");
    setFormError(null);
    try {
      const payload: Record<string, unknown> = { draft_config: draft };
      if (publish) {
        payload.config = draft;
        payload.status = "published";
        payload.published_at = new Date().toISOString();
      }
      const { error: err } = await supabase.from("site_sections").update(payload).eq("id", active.id);
      if (err) throw err;
      notify(publish ? "تغییرات منتشر شد و در سایت اعمال شد." : "پیش‌نویس ذخیره شد.");
      await load();
    } catch (e) {
      setFormError(friendlyError(e));
    } finally {
      setSaving(null);
    }
  };

  const addGalleryItem = () => {
    if (!galleryDraft) return;
    setGalleryDraft({ items: [...galleryDraft.items, { id: `g${Date.now()}`, headline: "", subline: "", imageUrl: "", imageAlt: "", actionLabel: "مشاهده", actionHref: "#", showPlay: true }] });
  };

  const removeGalleryItem = (id: string) => {
    if (!galleryDraft) return;
    setGalleryDraft({ items: galleryDraft.items.filter((x) => x.id !== id) });
  };

  const updateGalleryItem = (id: string, patch: Partial<GalleryItem>) => {
    if (!galleryDraft) return;
    setGalleryDraft({ items: galleryDraft.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  };

  const moveLayout = (idx: number, dir: -1 | 1) => {
    if (!layoutDraft) return;
    const next = [...layoutDraft.order];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setLayoutDraft({ order: next });
  };

  const toggleLayout = (idx: number) => {
    if (!layoutDraft) return;
    const next = [...layoutDraft.order];
    next[idx] = { ...next[idx], enabled: !next[idx].enabled };
    setLayoutDraft({ order: next });
  };

  return (
    <>
      <PageHeader
        title="صفحات و بخش‌های سایت"
        description="بخش‌های صفحه‌ی اصلی (هیرو، CTA، عنوان آزمون/مراحل، گالری «استرکتنامه» و ترتیب) به‌صورت ساختاریافته مدیریت می‌شوند. پیش‌نویس و انتشار جدا هستند."
        breadcrumb={["پنل مدیریت", "محتوا"]}
      />

      <div className="mb-4 flex gap-1.5 rounded-lg border border-ink/8 bg-white p-1">
        <button type="button" onClick={() => setTab("sections")} className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 text-[14px] font-bold ${tab === "sections" ? "bg-steel/10 text-ink" : "text-body hover:text-ink"}`}>
          <LayoutTemplate className="h-3.5 w-3.5" />
          بخش‌های صفحه‌ی اصلی
        </button>
        <button type="button" onClick={() => setTab("pages")} className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 text-[14px] font-bold ${tab === "pages" ? "bg-steel/10 text-ink" : "text-body hover:text-ink"}`}>
          <Eye className="h-3.5 w-3.5" />
          صفحات
        </button>
      </div>

      {tab === "pages" ? (
        <CrudPage config={pageConfig} />
      ) : loading ? (
        <Card><LoadingState label="دریافت بخش‌ها…" /></Card>
      ) : error ? (
        <Card><ErrorState message={error} onRetry={load} /></Card>
      ) : sections.length === 0 ? (
        <Card><div className="px-5 py-12 text-center text-[14px] text-body">بخشی ثبت نشده است. migration اولیه را اجرا کنید.</div></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-4">
          <Card className="lg:col-span-1">
            <div className="flex items-center justify-between gap-2 border-b border-ink/8 px-3.5 py-2.5">
              <h2 className="text-[13px] font-extrabold text-ink">بخش‌ها</h2>
              <button type="button" onClick={() => void load()} className="flex h-8 w-8 items-center justify-center rounded-md text-body hover:bg-mist" aria-label="به‌روزرسانی فهرست بخش‌ها" title="به‌روزرسانی">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            {canWrite && missingSections.length > 0 && (
              <div className="border-b border-ink/8 p-2.5">
                <p className="mb-2 text-[12px] leading-5 text-body">
                  {missingSections.length.toLocaleString("fa-IR")} بخش استاندارد هنوز در پایگاه داده نیست: {missingSections.map((m) => m.name).join("، ")}.
                </p>
                <Button size="sm" className="w-full" onClick={() => void ensureStandardSections()} loading={ensuring}>
                  <Plus className="h-3.5 w-3.5" />
                  افزودن بخش‌های استاندارد
                </Button>
              </div>
            )}
            <ul className="p-2">
              {sections.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => setActiveId(s.id)} className={`mb-1 flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-right ${s.id === activeId ? "bg-steel/10" : "hover:bg-mist"}`}>
                    <span className="text-[14px] font-bold text-ink">{s.name}</span>
                    <PublishBadge status={s.status} />
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="lg:col-span-3">
            {active && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/8 px-4 py-3">
                  <div>
                    <h2 className="text-[14px] font-extrabold text-ink">{active.name}</h2>
                    <p className="mt-0.5 text-[14px] text-body">کلید: <code dir="ltr">{active.key}</code> · آخرین تغییر: {formatDate(active.updated_at, true)}</p>
                  </div>
                  <PublishBadge status={active.status} />
                </div>

                <div className="space-y-3 p-4">
                  <p className="rounded-lg bg-[#f8fafc] p-3 text-[14px] leading-6 text-body">
                    تغییرات ابتدا در <strong className="text-ink">پیش‌نویس</strong> ذخیره می‌شود. با «انتشار» همان نسخه روی سایت اعمال می‌شود.
                  </p>

                  {/* هیرو */}
                  {active.key === "hero" && heroDraft && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="برچسب بالای عنوان"><input value={heroDraft.eyebrow} onChange={(e) => setHeroDraft({ ...heroDraft, eyebrow: e.target.value })} className={inputClass} disabled={!canWrite} /></Field>
                      <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                        <Field label="خط اول عنوان" required><input value={heroDraft.titleLine1} onChange={(e) => setHeroDraft({ ...heroDraft, titleLine1: e.target.value })} className={inputClass} disabled={!canWrite} /></Field>
                        <Field label="خط دوم عنوان" required><input value={heroDraft.titleLine2} onChange={(e) => setHeroDraft({ ...heroDraft, titleLine2: e.target.value })} className={inputClass} disabled={!canWrite} /></Field>
                      </div>
                      <div className="sm:col-span-2"><Field label="توضیح Hero" required><textarea rows={3} value={heroDraft.description} onChange={(e) => setHeroDraft({ ...heroDraft, description: e.target.value })} className={`${inputClass} leading-6`} disabled={!canWrite} /></Field></div>
                      <Field label="دکمه اصلی — متن"><input value={heroDraft.primaryLabel} onChange={(e) => setHeroDraft({ ...heroDraft, primaryLabel: e.target.value })} className={inputClass} disabled={!canWrite} /></Field>
                      <Field label="دکمه اصلی — مقصد"><input dir="ltr" value={heroDraft.primaryHref} onChange={(e) => setHeroDraft({ ...heroDraft, primaryHref: e.target.value })} className={`${inputClass} text-left`} disabled={!canWrite} /></Field>
                      <Field label="دکمه دوم — متن"><input value={heroDraft.secondaryLabel} onChange={(e) => setHeroDraft({ ...heroDraft, secondaryLabel: e.target.value })} className={inputClass} disabled={!canWrite} /></Field>
                      <Field label="دکمه دوم — مقصد"><input dir="ltr" value={heroDraft.secondaryHref} onChange={(e) => setHeroDraft({ ...heroDraft, secondaryHref: e.target.value })} className={`${inputClass} text-left`} disabled={!canWrite} /></Field>
                      <div className="sm:col-span-2">
                        <Field label="امضای بصری (ارب / تصویر / ویدیو)" hint="ویدیو بدون کنترل و با پخش خودکار نمایش داده می‌شود.">
                          <div className="grid gap-2 sm:grid-cols-3">
                            {(["none", "image", "video"] as const).map((ty) => (
                              <label key={ty} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-[14px] font-semibold ${heroDraft.mediaType === ty ? "border-steel bg-steel/10 text-ink" : "border-ink/10 bg-white text-body"}`}>
                                <input type="radio" name="hero-media" checked={heroDraft.mediaType === ty} onChange={() => setHeroDraft({ ...heroDraft, mediaType: ty })} className="accent-[#4a58a6]" disabled={!canWrite} />
                                {ty === "none" ? "ارب گرادیانی (بدون رسانه)" : ty === "image" ? "تصویر" : "ویدیو"}
                              </label>
                            ))}
                          </div>
                        </Field>
                      </div>
                      {heroDraft.mediaType === "image" && (
                        <div className="sm:col-span-2">
                          <Field label="آدرس تصویر" required>
                            <input dir="ltr" value={heroDraft.imageUrl} onChange={(e) => setHeroDraft({ ...heroDraft, imageUrl: e.target.value })} className={`${inputClass} text-left`} disabled={!canWrite} placeholder="https://…" />
                          </Field>
                        </div>
                      )}
                      {heroDraft.mediaType === "video" && (
                        <div className="sm:col-span-2">
                          <Field label="آدرس ویدیو (MP4/WebM)" required>
                            <input dir="ltr" value={heroDraft.videoUrl} onChange={(e) => setHeroDraft({ ...heroDraft, videoUrl: e.target.value })} className={`${inputClass} text-left`} disabled={!canWrite} placeholder="https://….mp4" />
                          </Field>
                          <p className="mt-1 text-[11.5px] text-body">بدون کنترل کاربر؛ پخش خودکار، تکرارشونده و در کادر.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* CTA (ترکیبی از علم…) */}
                  {active.key === "cta" && ctaDraft && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="برچسب (eyebrow)"><input value={ctaDraft.eyebrow} onChange={(e) => setCtaDraft({ ...ctaDraft, eyebrow: e.target.value })} className={inputClass} disabled={!canWrite} /></Field>
                      <Field label="تصویر/ویدیوی اصلی بنر" hint="اگر خالی نباشد، به‌جای گرافیک سمت چپ نمایش داده می‌شود.">
                        <div className="grid gap-2 sm:grid-cols-3">
                          {(["none", "image", "video"] as const).map((ty) => (
                            <label key={ty} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-[14px] font-semibold ${ctaDraft.mediaType === ty ? "border-steel bg-steel/10 text-ink" : "border-ink/10 bg-white text-body"}`}>
                              <input type="radio" name="cta-media" checked={ctaDraft.mediaType === ty} onChange={() => setCtaDraft({ ...ctaDraft, mediaType: ty })} className="accent-[#4a58a6]" disabled={!canWrite} />
                              {ty === "none" ? "گرافیک داخلی" : ty === "image" ? "تصویر" : "ویدیو"}
                            </label>
                          ))}
                        </div>
                      </Field>
                      {ctaDraft.mediaType !== "none" && (
                        <div className="sm:col-span-2">
                          <Field label="آدرس رسانه (امضای بصری بنر)" required>
                            <input dir="ltr" value={ctaDraft.mediaUrl || ""} onChange={(e) => setCtaDraft({ ...ctaDraft, mediaUrl: e.target.value })} className={`${inputClass} text-left`} disabled={!canWrite} placeholder="https://…" />
                          </Field>
                        </div>
                      )}
                      <div className="sm:col-span-2"><Field label="آدرس تصویر پروفیل دستیار" hint="تصویر کنار «دستیار هوشمند آریاسازه»."><input dir="ltr" value={ctaDraft.avatarUrl} onChange={(e) => setCtaDraft({ ...ctaDraft, avatarUrl: e.target.value })} className={`${inputClass} text-left`} disabled={!canWrite} placeholder="https://…" /></Field></div>
                      <div className="sm:col-span-2"><Field label="عنوان بنر" required><input value={ctaDraft.title} onChange={(e) => setCtaDraft({ ...ctaDraft, title: e.target.value })} className={inputClass} disabled={!canWrite} /></Field></div>
                      <div className="sm:col-span-2"><Field label="توضیح بنر" required><textarea rows={3} value={ctaDraft.description} onChange={(e) => setCtaDraft({ ...ctaDraft, description: e.target.value })} className={`${inputClass} leading-6`} disabled={!canWrite} /></Field></div>
                      <div className="sm:col-span-2">
                        <Field label="ویژگی‌های زیر بنر (۳ مورد)" hint="مثل: حریم خصوصی محافظت‌شده / محتوای معتبر / …">
                          <div className="space-y-2">
                            {ctaDraft.features.map((f, i) => (
                              <div key={i} className="flex gap-2">
                                <input value={f.label} onChange={(e) => setCtaDraft({ ...ctaDraft, features: ctaDraft.features.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className={inputClass} placeholder={`ویژگی ${i + 1}`} disabled={!canWrite} />
                                <select value={f.icon} onChange={(e) => setCtaDraft({ ...ctaDraft, features: ctaDraft.features.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)) })} className={`${inputClass} max-w-[10rem]`} disabled={!canWrite}>
                                  {Object.keys(sectionOrderDefs).length === 0 ? null : (
                                    <>
                                      <option value="lock">قفل</option>
                                      <option value="mic">صوت/تصویر</option>
                                      <option value="award">تأیید متخصص</option>
                                      <option value="shield">امنیت</option>
                                      <option value="flask">آزمون/پژوهش</option>
                                      <option value="user">انسان</option>
                                      <option value="sparkle">هوش مصنوعی</option>
                                    </>
                                  )}
                                </select>
                              </div>
                            ))}
                          </div>
                        </Field>
                      </div>
                    </div>
                  )}

                  {/* عنوان آزمون / مراحل */}
                  {["tests-heading", "steps-heading"].includes(active.key) && textDraft && (
                    <div className="space-y-3">
                      <Field label="برچسب بالای عنوان"><input value={textDraft.label} onChange={(e) => setTextDraft({ ...textDraft, label: e.target.value })} className={inputClass} disabled={!canWrite} /></Field>
                      <Field label="عنوان" required><input value={textDraft.title} onChange={(e) => setTextDraft({ ...textDraft, title: e.target.value })} className={inputClass} disabled={!canWrite} /></Field>
                      <Field label="توضیح" required><textarea rows={3} value={textDraft.description} onChange={(e) => setTextDraft({ ...textDraft, description: e.target.value })} className={`${inputClass} leading-6`} disabled={!canWrite} /></Field>
                    </div>
                  )}

                  {/* گالری (شناخت بهتر خود) */}
                  {(active.key === "gallery" || active.key === "testimonials") && galleryDraft && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[14px] font-semibold text-ink">کارت‌های این بخش — صفر، چند یا هر تعداد که انتشار می‌کنید.</p>
                        {canWrite && (
                          <Button size="sm" onClick={addGalleryItem}><Plus className="h-3.5 w-3.5" />کارت جدید</Button>
                        )}
                      </div>
                      {galleryDraft.items.length === 0 ? (
                        <p className="rounded-lg bg-[#f8fafc] p-3 text-[14px] text-body">کارتی وجود ندارد؛ پس از افزودن و انتشار، در سایت نشان داده می‌شود.</p>
                      ) : (
                        galleryDraft.items.map((it) => (
                          <div key={it.id} className="rounded-lg border border-ink/8 p-3.5">
                            <div className="mb-2 grid gap-2 sm:grid-cols-2">
                              <Field label="تیتر روی تصویر" required><input value={it.headline} onChange={(e) => updateGalleryItem(it.id, { headline: e.target.value })} className={inputClass} disabled={!canWrite} /></Field>
                              <Field label="زیرتیتر (اختیاری)"><input value={it.subline} onChange={(e) => updateGalleryItem(it.id, { subline: e.target.value })} className={inputClass} disabled={!canWrite} /></Field>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Field label="آدرس تصویر"><input dir="ltr" value={it.imageUrl ?? ""} onChange={(e) => updateGalleryItem(it.id, { imageUrl: e.target.value })} className={`${inputClass} text-left`} disabled={!canWrite} placeholder="https://…" /></Field>
                              <Field label="متن جایگزین تصویر (alt)" required={Boolean(it.imageUrl)}><input value={it.imageAlt ?? ""} onChange={(e) => updateGalleryItem(it.id, { imageAlt: e.target.value })} className={inputClass} disabled={!canWrite} /></Field>
                            </div>
                            <div className="mt-2 grid gap-2 sm:grid-cols-3">
                              <Field label="متن اکشن (اختیاری)"><input value={it.actionLabel ?? ""} onChange={(e) => updateGalleryItem(it.id, { actionLabel: e.target.value })} className={inputClass} disabled={!canWrite} /></Field>
                              <Field label="لینک"><input dir="ltr" value={it.actionHref ?? ""} onChange={(e) => updateGalleryItem(it.id, { actionHref: e.target.value })} className={`${inputClass} text-left`} disabled={!canWrite} /></Field>
                              <div className="flex items-end gap-3">
                                <label className="flex min-h-10 items-center gap-2 text-[14px] font-semibold text-ink">
                                  <input type="checkbox" checked={it.showPlay ?? true} onChange={(e) => updateGalleryItem(it.id, { showPlay: e.target.checked })} className="h-4 w-4 accent-[#4a58a6]" disabled={!canWrite} />
                                  نشانه‌ی پخش در وسط کارت
                                </label>
                                {canWrite && <button type="button" onClick={() => removeGalleryItem(it.id)} className="ms-auto flex min-h-9 items-center gap-1 rounded-md px-2.5 text-[14px] font-bold text-[#a33a34] hover:bg-[#fbeceb]"><Trash2 className="h-3.5 w-3.5" />حذف کارت</button>}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* ترتیب بخش‌های صفحه */}
                  {active.key === "layout" && layoutDraft && (
                    <div className="space-y-3">
                      <p className="rounded-lg bg-[#f8fafc] p-3 text-[14px] leading-6 text-body">
                        ترتیب نمایش بخش‌های قابل‌کنترل صفحه‌ی اصلی. فقط بخش با «فعال» در صفحه دیده می‌شود؛ «قهرمان» همیشه همان ابتدای صفحه است.
                      </p>
                      <ul className="space-y-2">
                        {layoutDraft.order.map((it, idx) => (
                          <li key={it.key} className="flex items-center gap-2 rounded-lg border border-ink/8 bg-white p-2.5">
                            <span className="text-[13px] font-bold text-body">{idx + 1}.</span>
                            <div className="flex-1 min-w-0">
                              <p className="truncate text-[14px] font-bold text-ink">{sectionOrderDefs[it.key].label}</p>
                              <p className="text-[11.5px] text-body">فعال در سایت: {it.enabled ? "بله" : "خیر"}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button type="button" onClick={() => moveLayout(idx, -1)} disabled={idx === 0} className="flex h-9 w-9 items-center justify-center rounded-md border border-ink/8 text-body hover:bg-mist disabled:opacity-30" aria-label="انتقال به بالا"><ArrowUp className="h-4 w-4" /></button>
                              <button type="button" onClick={() => moveLayout(idx, 1)} disabled={idx === layoutDraft.order.length - 1} className="flex h-9 w-9 items-center justify-center rounded-md border border-ink/8 text-body hover:bg-mist disabled:opacity-30" aria-label="انتقال به پایین"><ArrowDown className="h-4 w-4" /></button>
                              <button type="button" onClick={() => toggleLayout(idx)} className={`min-h-9 rounded-md px-3 text-[14px] font-bold ${it.enabled ? "bg-[#e8f1ed] text-[#2f7d6e]" : "bg-[#fbeceb] text-[#a33a34]"}`} disabled={!canWrite}>{it.enabled ? "غیرفعال" : "فعال"}</button>
                              <button type="button" onClick={() => {
                                if (!layoutDraft) return;
                                const next = layoutDraft.order.filter((_, i) => i !== idx);
                                if (next.length === 0) { setFormError("حداقل یک بخش باید باقی بماند."); return; }
                                setLayoutDraft({ order: next });
                                setFormError(null);
                              }} disabled={!canWrite} className="flex h-9 w-9 items-center justify-center rounded-md border border-ink/8 text-[#a33a34] hover:bg-[#fbeceb] disabled:opacity-30" aria-label="حذف بخش از لیست ترتیب">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                      {canWrite && (
                        <div className="flex flex-wrap items-center gap-2">
                          {sectionKeys.filter((k) => !layoutDraft.order.some((o) => o.key === k)).map((k) => (
                            <Button key={k} size="sm" variant="secondary" onClick={() => setLayoutDraft({ order: [...layoutDraft.order, { key: k, enabled: true }] })}>افزودن «{sectionOrderDefs[k].label}»</Button>
                          ))}
                          {sectionKeys.filter((k) => !layoutDraft.order.some((o) => o.key === k)).length === 0 && (
                            <span className="text-[14px] text-body">همه‌ی بخش‌ها در لیست هستند.</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {formError && <ErrorState message={formError} />}

                  {canWrite && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-ink/8 pt-3">
                      <Button variant="secondary" onClick={() => void save(false)} loading={saving === "draft"}>
                        <Save className="h-3.5 w-3.5" />
                        ذخیره‌ی پیش‌نویس
                      </Button>
                      <Button onClick={() => void save(true)} loading={saving === "publish"}>
                        <Send className="h-3.5 w-3.5" />
                        انتشار روی سایت
                      </Button>
                      <Button variant="ghost" size="sm" onClick={async () => {
                        if (!supabase || !active) return;
                        const { error: err } = await supabase.from("site_sections").update({ draft_config: active.config }).eq("id", active.id);
                        if (err) notify(friendlyError(err), "error");
                        else { notify("پیش‌نویس به نسخه‌ی منتشرشده بازگشت."); await load(); }
                      }}>
                        <Undo2 className="h-3.5 w-3.5" />
                        بازگردانی پیش‌نویس
                      </Button>
                      <Link to="/" className="ms-auto text-[14px] font-bold text-steel">مشاهده‌ی سایت</Link>
                    </div>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
