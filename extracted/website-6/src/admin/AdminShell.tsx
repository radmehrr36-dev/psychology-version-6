import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Bot,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  Globe2,
  Image as ImageIcon,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  MessageSquare,
  Newspaper,
  PanelTop,
  SlidersHorizontal,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import { LogoMark } from "../components/Logo";
import { useAuth } from "../lib/auth";
import { supabaseProjectHost } from "../lib/supabase";
import { roleLabels, type AppRole } from "../lib/types";
import { cn } from "../utils/cn";
import { AttentionProvider } from "./dashboard/attention";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationCenter } from "./NotificationCenter";
import { PrefsDialog } from "./PrefsDialog";
import { useAdminPrefs } from "./prefs";
import { Tooltip } from "./ui";
import { useDismiss } from "./useDismiss";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: [string, string];
  end?: boolean;
}

const navGroups: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "نمای کلی",
    items: [
      { to: "/admin", label: "داشبورد", icon: LayoutDashboard, end: true },
      { to: "/admin/audit-logs", label: "رویدادهای مدیریتی", icon: Activity, permission: ["audit", "read"] },
    ],
  },
  {
    title: "محتوا",
    items: [
      { to: "/admin/pages", label: "صفحات و بخش‌ها", icon: FileText, permission: ["content", "read"] },
      { to: "/admin/navigation", label: "هدر و فوتر", icon: PanelTop, permission: ["content", "read"] },
      { to: "/admin/articles", label: "مقالات", icon: Newspaper, permission: ["content", "read"] },
      { to: "/admin/magazines", label: "مجلات", icon: Library, permission: ["content", "read"] },
      { to: "/admin/books", label: "کتاب‌ها و منابع", icon: BookOpen, permission: ["content", "read"] },
      { to: "/admin/media", label: "کتابخانه‌ی رسانه", icon: ImageIcon, permission: ["media", "read"] },
    ],
  },
  {
    title: "آزمون‌ها و افراد",
    items: [
      { to: "/admin/tests", label: "آزمون‌های روان‌شناختی", icon: Bot, permission: ["tests", "read"] },
      { to: "/admin/psychologists", label: "متخصصان", icon: Stethoscope, permission: ["psychologists", "read"] },
      { to: "/admin/users", label: "کاربران", icon: Users, permission: ["users", "read"] },
      { to: "/admin/admins", label: "مدیران و دسترسی‌ها", icon: ShieldCheck, permission: ["admins", "read"] },
      { to: "/admin/messages", label: "پیام‌های پشتیبانی", icon: MessageSquare, permission: ["support", "read"] },
    ],
  },
  {
    title: "سیستم",
    items: [
      { to: "/admin/api-settings", label: "سرویس‌ها و API", icon: Globe2, permission: ["settings", "api"] },
      { to: "/admin/settings", label: "تنظیمات سایت", icon: Settings, permission: ["settings", "read"] },
    ],
  },
];

const titles: Record<string, string> = {
  "/admin": "داشبورد",
  "/admin/users": "کاربران",
  "/admin/admins": "مدیران و دسترسی‌ها",
  "/admin/tests": "آزمون‌های روان‌شناختی",
  "/admin/pages": "صفحات و بخش‌های سایت",
  "/admin/media": "کتابخانه‌ی رسانه",
  "/admin/navigation": "هدر و فوتر",
  "/admin/magazines": "مجلات",
  "/admin/articles": "مقالات",
  "/admin/books": "کتاب‌ها و منابع",
  "/admin/messages": "پیام‌های پشتیبانی",
  "/admin/psychologists": "متخصصان",
  "/admin/api-settings": "سرویس‌ها و API",
  "/admin/audit-logs": "رویدادهای مدیریتی",
  "/admin/settings": "تنظیمات سایت",
};

export function AdminShell() {
  return (
    <AttentionProvider>
      <ShellInner />
    </AttentionProvider>
  );
}

function ProfileMenu({ onOpenPrefs, onSignOut }: { onOpenPrefs: () => void; onSignOut: () => void }) {
  const { profile, can } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const display = profile?.full_name || profile?.email || "مدیر";
  const itemClass =
    "flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-right text-[14px] font-semibold text-ink transition-colors duration-150 hover:bg-mist";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="منوی پروفایل"
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn("flex h-10 items-center gap-2 rounded-xl pe-1 ps-1 transition-colors duration-150 hover:bg-mist", open && "bg-mist")}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-steel/12 text-[13px] font-extrabold text-steel" aria-hidden="true">
          {display.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-[8rem] truncate text-[13px] font-bold text-ink xl:block">{display}</span>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-2 w-64 rounded-2xl border border-adm-line bg-white p-2 shadow-[0_16px_40px_-16px_rgb(16_24_40/0.3)]">
          <div className="mb-1 border-b border-adm-line px-3 pb-2.5 pt-1.5">
            <p className="truncate text-[14px] font-extrabold text-ink">{display}</p>
            <p dir="ltr" className="truncate text-left text-[12.5px] text-body">
              {profile?.email}
            </p>
            <p className="mt-1 inline-block rounded-full bg-steel/10 px-2 py-0.5 text-[12px] font-bold text-steel">
              {profile?.role ? roleLabels[profile.role as AppRole] : "—"}
            </p>
          </div>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              close();
              onOpenPrefs();
            }}
          >
            <SlidersHorizontal className="h-4 w-4 text-body" />
            تنظیمات داشبورد من
          </button>
          {can("settings", "read") && (
            <Link to="/admin/settings" role="menuitem" onClick={close} className={itemClass}>
              <Settings className="h-4 w-4 text-body" />
              تنظیمات سایت
            </Link>
          )}
          <Link to="/" role="menuitem" onClick={close} className={itemClass}>
            <ArrowUpRight className="h-4 w-4 text-body" />
            مشاهده‌ی سایت
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={onSignOut}
            className="mt-1 flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-right text-[14px] font-bold text-[#a33a34] transition-colors duration-150 hover:bg-[#fbeceb]"
          >
            <LogOut className="h-4 w-4" />
            خروج امن
          </button>
        </div>
      )}
    </div>
  );
}

function ShellInner() {
  const { can, profile, signOut } = useAuth();
  const { prefs, update } = useAdminPrefs();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const collapsed = prefs.sidebarCollapsed;

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Drawer موبایل: بستن با Escape و جلوگیری از اسکرول پس‌زمینه
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const baseTitle =
    titles[location.pathname] ??
    Object.entries(titles).find(([k]) => k !== "/admin" && location.pathname.startsWith(k))?.[1] ??
    "پنل مدیریت";
  const crumbs = ["پنل مدیریت", baseTitle];
  if (/^\/admin\/tests\/.+/.test(location.pathname)) crumbs.push("جزئیات آزمون");

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin/login", { replace: true });
  };

  const renderSidebar = (isCollapsed: boolean, inDrawer: boolean) => (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center border-b border-adm-line py-4", isCollapsed ? "flex-col gap-3 px-2" : "justify-between px-4")}>
        <Link to="/" className="flex items-center gap-2.5" aria-label="آریاسازه — مشاهده‌ی سایت" title={isCollapsed ? "آریاسازه" : undefined}>
          <LogoMark className="h-8 w-8 shrink-0 text-steel" />
          {!isCollapsed && (
            <span className="leading-tight">
              <span className="block text-[16px] font-extrabold text-ink">آریاسازه</span>
              <span className="block text-[12px] font-medium text-body">پنل مدیریت</span>
            </span>
          )}
        </Link>
        {inDrawer ? (
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-body transition-colors duration-150 hover:bg-mist"
            aria-label="بستن منوی پنل"
          >
            <X className="h-5 w-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => update({ sidebarCollapsed: !collapsed })}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-body transition-colors duration-150 hover:bg-mist hover:text-ink"
            aria-label={collapsed ? "باز کردن سایدبار" : "جمع کردن سایدبار"}
            aria-pressed={collapsed}
            title={collapsed ? "باز کردن سایدبار" : "جمع کردن سایدبار"}
          >
            {collapsed ? <ChevronsLeft className="h-4.5 w-4.5" /> : <ChevronsRight className="h-4.5 w-4.5" />}
          </button>
        )}
      </div>

      <nav className={cn("flex-1 overflow-y-auto py-3", isCollapsed ? "px-2" : "px-2.5")} aria-label="ناوبری پنل مدیریت">
        {navGroups.map((group) => {
          const items = group.items.filter((item) => !item.permission || can(item.permission[0], item.permission[1]));
          if (items.length === 0) return null;
          return (
            <div key={group.title} className="mb-4">
              {isCollapsed ? (
                <div className="mx-3 mb-2 h-px bg-adm-line" aria-hidden="true" />
              ) : (
                <p className="mb-1.5 px-2.5 text-[12px] font-bold tracking-wide text-body/80">{group.title}</p>
              )}
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      title={isCollapsed ? item.label : undefined}
                      aria-label={isCollapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          "relative flex min-h-11 items-center gap-2.5 rounded-xl text-[13.5px] font-semibold transition-colors duration-150",
                          isCollapsed ? "justify-center px-0" : "px-2.5",
                          isActive ? "bg-ink text-white shadow-soft" : "text-body hover:bg-white/80 hover:text-ink"
                        )
                      }
                    >
                      {() => (
                        <>
                          <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
                          {!isCollapsed && <span className="truncate">{item.label}</span>}
                          {!isCollapsed && <ChevronLeft className="ms-auto h-3.5 w-3.5 opacity-40" />}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className={cn("border-t border-adm-line", isCollapsed ? "p-2" : "p-3")}>
        <Link
          to="/"
          title={isCollapsed ? "مشاهده‌ی سایت" : undefined}
          aria-label={isCollapsed ? "مشاهده‌ی سایت" : undefined}
          className={cn(
            "mb-2 flex min-h-10 items-center rounded-xl text-[13px] font-semibold text-body transition-colors duration-150 hover:bg-mist hover:text-ink",
            isCollapsed ? "justify-center" : "justify-between px-2.5"
          )}
        >
          {!isCollapsed && "مشاهده‌ی سایت"}
          <ArrowUpRight className="h-4 w-4" />
        </Link>

        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full bg-steel/12 text-[13px] font-extrabold text-steel"
              title={`${profile?.full_name || profile?.email || ""} — ${profile?.role ? roleLabels[profile.role as AppRole] : ""}`}
              aria-hidden="true"
            >
              {(profile?.full_name || profile?.email || "؟").slice(0, 1).toUpperCase()}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="خروج امن"
              title="خروج امن"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[#a33a34] transition-colors duration-150 hover:bg-[#fbeceb]"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/80 bg-white/80 p-3 shadow-chip">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-steel/12 text-[13px] font-extrabold text-steel" aria-hidden="true">
                {(profile?.full_name || profile?.email || "؟").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-bold text-ink">{profile?.full_name || profile?.email}</p>
                <p className="text-[12.5px] text-body">{profile?.role ? roleLabels[profile.role as AppRole] : "—"}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-2.5 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-white text-[13px] font-bold text-[#a33a34] ring-1 ring-adm-line transition-colors duration-150 hover:bg-[#fbeceb]"
            >
              <LogOut className="h-3.5 w-3.5" />
              خروج امن
            </button>
          </div>
        )}
        {supabaseProjectHost && !isCollapsed && (
          <p dir="ltr" className="mt-2 truncate text-center text-[11px] text-body/80">
            {supabaseProjectHost}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className={cn("admin-theme min-h-screen", prefs.density === "compact" && "density-compact")}>
      {/* سایدبار دسکتاپ (ثابت یا جمع‌شده) */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-30 hidden border-l border-white/70 bg-white/70 backdrop-blur-xl transition-[width] duration-200 lg:block",
          collapsed ? "w-[4.5rem]" : "w-64"
        )}
      >
        {renderSidebar(collapsed, false)}
      </aside>

      {/* کشوی موبایل/تبلت */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="منوی پنل مدیریت">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 right-0 w-[min(18rem,86vw)] border-l border-white/70 bg-cream shadow-xl">{renderSidebar(false, true)}</aside>
        </div>
      )}

      <div className={cn("transition-[margin] duration-200", collapsed ? "lg:mr-[4.5rem]" : "lg:mr-64")}>
        <header className="sticky top-0 z-20 border-b border-white/70 bg-white/60 backdrop-blur-xl">
          <div className="flex min-h-16 items-center gap-2 px-3 md:gap-3 md:px-6">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-ink transition-colors duration-150 hover:bg-mist lg:hidden"
              aria-label="بازکردن منوی پنل"
              aria-expanded={drawerOpen}
            >
              <Menu className="h-5 w-5" />
            </button>

            <nav aria-label="مسیر صفحه" className="flex min-w-0 items-center gap-1.5 text-[13px]">
              {crumbs.map((c, i) => (
                <span key={`${c}-${i}`} className={cn("flex min-w-0 items-center gap-1.5", i < crumbs.length - 1 && "hidden sm:flex")}>
                  {i > 0 && <ChevronLeft className="hidden h-3 w-3 shrink-0 text-body/60 sm:block" aria-hidden="true" />}
                  <span className={cn("truncate", i === crumbs.length - 1 ? "font-bold text-ink" : "text-body")} aria-current={i === crumbs.length - 1 ? "page" : undefined}>
                    {c}
                  </span>
                </span>
              ))}
            </nav>

            <div className="ms-auto flex items-center gap-1 md:gap-2">
              <GlobalSearch />
              <Tooltip label="تنظیمات داشبورد من">
                <button
                  type="button"
                  onClick={() => setPrefsOpen(true)}
                  aria-label="تنظیمات داشبورد من"
                  className="hidden h-10 w-10 items-center justify-center rounded-xl text-ink transition-colors duration-150 hover:bg-mist sm:flex"
                >
                  <SlidersHorizontal className="h-5 w-5" strokeWidth={1.8} />
                </button>
              </Tooltip>
              <NotificationCenter />
              <ProfileMenu onOpenPrefs={() => setPrefsOpen(true)} onSignOut={handleSignOut} />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[90rem] px-3 py-5 md:px-6 md:py-7">
          <Outlet />
        </main>
      </div>

      <PrefsDialog open={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </div>
  );
}
