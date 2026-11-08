import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "./supabase";

export type NavLocation = "header" | "footer_primary" | "footer_content" | "social";
export type SocialIcon = "instagram" | "telegram" | "linkedin" | "x" | "youtube" | "whatsapp" | "mail" | "globe";

export interface NavItem {
  id: string;
  location: NavLocation;
  label: string;
  href: string;
  icon: SocialIcon | null;
  sort_order: number;
  is_active: boolean;
  open_in_new_tab: boolean;
}

export interface FooterSettings {
  about: string;
  email: string;
  copyright: string;
  disclaimer: string;
  showSupportButton: boolean;
  showAdminLink: boolean;
}

/** پیش‌فرض‌ها = منوی فعلی سایت؛ اگر پایگاه داده پاسخ ندهد یا ردیفی نباشد همین‌ها نمایش داده می‌شوند */
export const defaultNavigation: NavItem[] = [
  { id: "h1", location: "header", label: "خانه", href: "/#top", icon: null, sort_order: 1, is_active: true, open_in_new_tab: false },
  { id: "h2", location: "header", label: "آزمون‌ها", href: "/tests", icon: null, sort_order: 2, is_active: true, open_in_new_tab: false },
  { id: "h3", location: "header", label: "دستیار هوشمند", href: "/#assistant", icon: null, sort_order: 3, is_active: true, open_in_new_tab: false },
  { id: "h4", location: "header", label: "متخصصان و محتوا", href: "/#experts", icon: null, sort_order: 4, is_active: true, open_in_new_tab: false },
  { id: "h5", location: "header", label: "درباره ما", href: "/#about", icon: null, sort_order: 5, is_active: true, open_in_new_tab: false },
  { id: "f1", location: "footer_primary", label: "خانه", href: "/", icon: null, sort_order: 1, is_active: true, open_in_new_tab: false },
  { id: "f2", location: "footer_primary", label: "آزمون‌ها", href: "/tests", icon: null, sort_order: 2, is_active: true, open_in_new_tab: false },
  { id: "f3", location: "footer_primary", label: "نقشه‌ی رشد", href: "/#map", icon: null, sort_order: 3, is_active: true, open_in_new_tab: false },
  { id: "f4", location: "footer_primary", label: "مراحل کار", href: "/#steps", icon: null, sort_order: 4, is_active: true, open_in_new_tab: false },
  { id: "f5", location: "footer_primary", label: "دستیار هوشمند", href: "/#assistant", icon: null, sort_order: 5, is_active: true, open_in_new_tab: false },
  { id: "c1", location: "footer_content", label: "مقالات", href: "/articles", icon: null, sort_order: 1, is_active: true, open_in_new_tab: false },
  { id: "c2", location: "footer_content", label: "مجلات", href: "/magazines", icon: null, sort_order: 2, is_active: true, open_in_new_tab: false },
  { id: "c3", location: "footer_content", label: "کتاب‌ها و منابع", href: "/books", icon: null, sort_order: 3, is_active: true, open_in_new_tab: false },
  { id: "c4", location: "footer_content", label: "کتابخانه", href: "/library", icon: null, sort_order: 4, is_active: true, open_in_new_tab: false },
  { id: "c5", location: "footer_content", label: "متخصصان", href: "/psychologists", icon: null, sort_order: 5, is_active: true, open_in_new_tab: false },
  { id: "s1", location: "social", label: "اینستاگرام", href: "https://instagram.com", icon: "instagram", sort_order: 1, is_active: true, open_in_new_tab: true },
  { id: "s2", location: "social", label: "تلگرام", href: "https://telegram.org", icon: "telegram", sort_order: 2, is_active: true, open_in_new_tab: true },
  { id: "s3", location: "social", label: "لینکدین", href: "https://linkedin.com", icon: "linkedin", sort_order: 3, is_active: true, open_in_new_tab: true },
];

export const defaultFooter: FooterSettings = {
  about:
    "آریاسازه پلتفرمی برای خودشناسی و رشد فردی است: آزمون‌های کوتاه، گزارش‌های شخصی، تمرین‌های روزانه و پیگیری پیشرفت، با تکیه بر دانش روان‌شناسی و همراهی متخصصان.",
  email: "salam@ariasazeh.ir",
  copyright: "© ۲۰۲۵ آریاسازه، تمامی حقوق محفوظ است.",
  disclaimer: "محتوای این وب‌سایت جایگزین مشاوره‌ی تخصصی نیست.",
  showSupportButton: true,
  showAdminLink: true,
};

const SOCIAL_ICONS = new Set<string>(["instagram", "telegram", "linkedin", "x", "youtube", "whatsapp", "mail", "globe"]);

/** فقط مسیر داخلی، لنگر، http(s)، mailto و tel پذیرفته می‌شود (ضد javascript:) */
export function isSafeHref(href: string): boolean {
  const h = href.trim();
  return /^(\/|#|https?:\/\/|mailto:|tel:)/i.test(h) && !/^javascript:/i.test(h);
}

export function sanitizeFooter(raw: unknown): FooterSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    about: str(r.about, defaultFooter.about),
    email: str(r.email, defaultFooter.email),
    copyright: str(r.copyright, defaultFooter.copyright),
    disclaimer: str(r.disclaimer, defaultFooter.disclaimer),
    showSupportButton: bool(r.showSupportButton, true),
    showAdminLink: bool(r.showAdminLink, true),
  };
}

interface NavigationValue {
  items: NavItem[];
  footer: FooterSettings;
  /** db: از پایگاه داده · default: پیش‌فرض (بدون اتصال یا بدون ردیف) */
  source: "db" | "default";
  byLocation: (loc: NavLocation) => NavItem[];
}

const NavigationContext = createContext<NavigationValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NavItem[]>(defaultNavigation);
  const [footer, setFooter] = useState<FooterSettings>(defaultFooter);
  const [source, setSource] = useState<"db" | "default">("default");

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const [nav, settings] = await Promise.all([
        supabase!.from("site_navigation").select("id,location,label,href,icon,sort_order,is_active,open_in_new_tab").eq("is_active", true).order("sort_order"),
        supabase!.from("site_settings").select("value").eq("key", "footer.general").maybeSingle(),
      ]);
      if (cancelled) return;
      if (!nav.error && nav.data && nav.data.length > 0) {
        const rows = (nav.data as NavItem[]).filter((n) => isSafeHref(n.href)).map((n) => ({ ...n, icon: n.icon && SOCIAL_ICONS.has(n.icon) ? n.icon : null }));
        setItems(rows);
        setSource("db");
      }
      if (!settings.error && settings.data?.value) setFooter(sanitizeFooter(settings.data.value));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<NavigationValue>(
    () => ({
      items,
      footer,
      source,
      byLocation: (loc) => items.filter((i) => i.location === loc && i.is_active).sort((a, b) => a.sort_order - b.sort_order),
    }),
    [items, footer, source]
  );
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used inside NavigationProvider");
  return ctx;
}
