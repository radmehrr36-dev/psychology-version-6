import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  BookOpen,
  ClipboardList,
  FileText,
  History,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Settings,
  Stethoscope,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { LogoMark } from "../components/Logo";
import { cn } from "../utils/cn";

export type PanelVariant = "user" | "pro" | "desk";

interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

/** هر نقش ظاهر، رنگ تأکید و ناوبری مستقل دارد (فقط قابلیت‌های واقعاً موجود لینک شده‌اند) */
const VARIANTS: Record<PanelVariant, { title: string; tagline: string; accent: string; tint: string; items: NavEntry[] }> = {
  user: {
    title: "پنل کاربر",
    tagline: "فضای شخصی من",
    accent: "#4a58a6",
    tint: "from-[#eef0fb] via-[#f6f7fc] to-[#f3eefb]",
    items: [
      { to: "/account", label: "خانه", icon: LayoutDashboard, end: true },
      { to: "/tests", label: "آزمون‌ها", icon: ClipboardList },
      { to: "/account#history", label: "تاریخچه و گزارش‌ها", icon: History },
      { to: "/library", label: "محتوای پیشنهادی", icon: BookOpen },
      { to: "/support", label: "پشتیبانی", icon: LifeBuoy },
      { to: "/account/profile", label: "پروفایل و تنظیمات", icon: Settings },
    ],
  },
  pro: {
    title: "پنل روانشناس",
    tagline: "فضای حرفه‌ای متخصص",
    accent: "#2f7d77",
    tint: "from-[#e9f4f2] via-[#f5f8fa] to-[#eef3fa]",
    items: [
      { to: "/pro", label: "پنل متخصص", icon: Stethoscope, end: true },
      { to: "/pro/apply", label: "درخواست و پروفایل حرفه‌ای", icon: FileText },
      { to: "/psychologists", label: "نمایش عمومی متخصصان", icon: Users },
      { to: "/support", label: "پشتیبانی", icon: LifeBuoy },
      { to: "/account/profile", label: "پروفایل و تنظیمات", icon: Settings },
    ],
  },
  desk: {
    title: "پنل پشتیبانی",
    tagline: "صف تیکت‌ها و گفت‌وگوها",
    accent: "#7a5ea8",
    tint: "from-[#f1ecfa] via-[#f6f6fb] to-[#f9eef3]",
    items: [
      { to: "/desk", label: "صف تیکت‌ها", icon: Inbox, end: true },
      { to: "/account/profile", label: "پروفایل و تنظیمات", icon: Settings },
    ],
  },
};

export function PanelShell({ variant, children }: { variant: PanelVariant | "auto"; children: ReactNode }) {
  const { profile, session, signOut, isPsychologist, isSupportSpecialist } = useAuth();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const resolved: PanelVariant = variant === "auto" ? (isSupportSpecialist ? "desk" : isPsychologist ? "pro" : "user") : variant;
  const cfg = VARIANTS[resolved];
  const name = profile?.full_name || session?.user.email || "حساب من";

  useEffect(() => setDrawer(false), [location.pathname, location.hash]);

  // پیمایش به لنگرهای داخل صفحه (مثل #history)
  useEffect(() => {
    if (!location.hash) return;
    const id = decodeURIComponent(location.hash.slice(1));
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    return () => window.clearTimeout(t);
  }, [location.hash, location.pathname]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link to="/" className="mb-6 flex items-center gap-2.5 px-2" aria-label="آریاسازه، صفحه‌ی اصلی">
        <LogoMark className="h-9 w-9" />
        <span className="leading-tight">
          <span className="block text-[18px] font-extrabold text-ink">آریاسازه</span>
          <span className="block text-[13px] font-medium text-body">{cfg.tagline}</span>
        </span>
      </Link>
      <p className="mb-2 px-3 text-[12.5px] font-bold text-fog">{cfg.title}</p>
      <nav aria-label={cfg.title} className="flex-1 space-y-1">
        {cfg.items.map((item) => {
          const active = item.to.includes("#") ? false : undefined;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex min-h-11 items-center gap-3 rounded-2xl px-3.5 text-[15px] font-semibold transition-all duration-200",
                  (active ?? isActive) ? "text-white shadow-soft" : "text-body hover:bg-white/80 hover:text-ink"
                )
              }
              style={({ isActive }) => ((active ?? isActive) ? { backgroundColor: cfg.accent } : undefined)}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="mt-6 rounded-3xl border border-white/80 bg-white/70 p-3.5 shadow-chip">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-extrabold text-white" style={{ backgroundColor: cfg.accent }} aria-hidden="true">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-bold text-ink">{name}</span>
            <span className="block text-[12.5px] text-fog">{cfg.title}</span>
          </span>
        </div>
        <button type="button" onClick={() => void signOut()} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl bg-[#fbeceb] text-[14px] font-bold text-[#a33a34] transition-colors hover:bg-[#f7dedb]">
          <LogOut className="h-4 w-4" />
          خروج
        </button>
      </div>
    </div>
  );

  return (
    <div className={cn("min-h-screen bg-gradient-to-br font-sans text-ink", cfg.tint)}>
      <div className="mx-auto flex min-h-screen max-w-[96rem] gap-5 p-3 md:p-5">
        <aside className="sticky top-5 hidden h-[calc(100vh-2.5rem)] w-[17.5rem] shrink-0 rounded-[32px] border border-white/80 bg-white/60 p-4 shadow-card backdrop-blur-xl lg:block">{sidebar}</aside>

        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="منوی پنل">
            <div className="absolute inset-0 bg-ink/35" onClick={() => setDrawer(false)} aria-hidden="true" />
            <aside className="absolute inset-y-0 right-0 w-[min(19rem,88vw)] border-l border-white/80 bg-cream p-4 shadow-xl">{sidebar}</aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="mb-5 flex items-center justify-between gap-3 rounded-[28px] border border-white/80 bg-white/60 px-4 py-3 shadow-chip backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setDrawer(true)} className="flex h-11 w-11 items-center justify-center rounded-2xl text-ink hover:bg-white lg:hidden" aria-label="بازکردن منو" aria-expanded={drawer}>
                {drawer ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <p className="text-[15px] font-bold text-ink">{cfg.title}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/" className="btn-secondary min-h-10 px-4 text-[14px]">بازگشت به سایت</Link>
              <Link to="/account/profile" aria-label="پروفایل من" className="hidden h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/80 text-ink sm:flex">
                <UserRound className="h-4.5 w-4.5" />
              </Link>
            </div>
          </header>
          <main className="min-w-0 flex-1 pb-10">{children}</main>
        </div>
      </div>
    </div>
  );
}
