import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, LayoutDashboard, LifeBuoy, LogOut, Menu, ShieldCheck, Stethoscope, UserRound, X } from "lucide-react";
import { Logo } from "./Logo";
import { cn } from "../utils/cn";
import { useNavigation } from "../lib/navigation";
import { useAuth } from "../lib/auth";
import { useDismiss } from "../admin/useDismiss";

/** لینک‌های داخلی با Router، بقیه با <a> */
function NavAnchor({
  href,
  newTab,
  className,
  onClick,
  children,
  ariaCurrent,
}: {
  href: string;
  newTab?: boolean;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
  ariaCurrent?: "page";
}) {
  const internal = href.startsWith("/") && !href.includes("#");
  if (internal) {
    return (
      <Link to={href} className={className} onClick={onClick} aria-current={ariaCurrent}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className} onClick={onClick} aria-current={ariaCurrent} target={newTab ? "_blank" : undefined} rel={newTab ? "noreferrer" : undefined}>
      {children}
    </a>
  );
}

function AccountMenu({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const { session, profile, hasAnyRole, isPsychologist, isSupportSpecialist, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  if (!session) {
    return mobile ? (
      <Link to="/login" onClick={onNavigate} className="block min-h-11 w-full rounded-2xl px-4 py-3 text-right text-base font-semibold text-body transition-colors hover:bg-white/70 hover:text-ink">
        ورود / ثبت‌نام
      </Link>
    ) : (
      <Link to="/login" className="hidden min-h-11 items-center gap-2 rounded-full border border-white/80 bg-white/80 px-5 text-base font-semibold text-ink shadow-chip transition-all duration-300 hover:-translate-y-0.5 hover:bg-white sm:flex">
        <UserRound className="h-4 w-4 text-steel" />
        ورود / ثبت‌نام
      </Link>
    );
  }

  const name = profile?.full_name || session.user.email || "حساب من";
  const panelHref = isSupportSpecialist ? "/desk" : isPsychologist ? "/pro" : "/account";
  const panelLabel = isSupportSpecialist ? "پنل پشتیبانی" : isPsychologist ? "پنل متخصص" : "داشبورد من";
  const PanelIcon = isSupportSpecialist || isPsychologist ? Stethoscope : LayoutDashboard;

  if (mobile) {
    return (
      <div className="space-y-1 border-t border-ink/8 pt-2">
        <p className="px-4 pt-1 text-sm font-bold text-ink">{name}</p>
        <Link to={panelHref} onClick={onNavigate} className="flex min-h-11 items-center gap-2 rounded-2xl px-4 py-3 text-base font-semibold text-body hover:bg-white/70 hover:text-ink">
          <PanelIcon className="h-4 w-4" />
          {panelLabel}
        </Link>
        {hasAnyRole && (
          <Link to="/admin" onClick={onNavigate} className="flex min-h-11 items-center gap-2 rounded-2xl px-4 py-3 text-base font-semibold text-body hover:bg-white/70 hover:text-ink">
            <ShieldCheck className="h-4 w-4" />
            پنل مدیریت
          </Link>
        )}
        <button type="button" onClick={() => void signOut()} className="flex min-h-11 w-full items-center gap-2 rounded-2xl px-4 py-3 text-right text-base font-semibold text-[#a33a34] hover:bg-white/70">
          <LogOut className="h-4 w-4" />
          خروج
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex min-h-11 items-center gap-2 rounded-full px-2 text-base font-semibold text-ink transition-colors hover:bg-white/70"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-steel/12 text-sm font-extrabold text-steel" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-[9rem] truncate lg:block">{name}</span>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-2 w-60 rounded-2xl border border-ink/8 bg-white p-2 shadow-card">
          <p className="truncate px-3 pb-2 pt-1 text-sm font-bold text-ink">{name}</p>
          <Link to={panelHref} role="menuitem" onClick={close} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-semibold text-ink hover:bg-mist">
            <PanelIcon className="h-4 w-4 text-body" />
            {panelLabel}
          </Link>
          {hasAnyRole && (
            <Link to="/admin" role="menuitem" onClick={close} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-semibold text-ink hover:bg-mist">
              <ShieldCheck className="h-4 w-4 text-body" />
              پنل مدیریت
            </Link>
          )}
          <Link to="/support" role="menuitem" onClick={close} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-semibold text-ink hover:bg-mist">
            <LifeBuoy className="h-4 w-4 text-body" />
            پشتیبانی
          </Link>
          <Link to="/account/profile" role="menuitem" onClick={close} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-semibold text-ink hover:bg-mist">
            <UserRound className="h-4 w-4 text-body" />
            حساب من
          </Link>
          <button type="button" role="menuitem" onClick={() => void signOut()} className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-right text-[15px] font-bold text-[#a33a34] hover:bg-[#fbeceb]">
            <LogOut className="h-4 w-4" />
            خروج
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { byLocation } = useNavigation();
  const navItems = byLocation("header");
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState("top");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // تشخیص بخش فعال (فقط برای لنگرهای صفحه‌ی اصلی)
  useEffect(() => {
    const ids = navItems.map((n) => n.href.split("#")[1]).filter((v): v is string => Boolean(v));
    const targets = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => Boolean(el));
    if (targets.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveId(visible.target.id);
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.2, 0.5] }
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [navItems, location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string) => {
    const hash = href.split("#")[1];
    if (hash) return location.pathname === "/" && activeId === hash;
    const path = href.split("#")[0];
    return path !== "/" && location.pathname.startsWith(path);
  };

  const linkClass = (active: boolean, mobile = false) =>
    cn(
      "relative rounded-full font-semibold transition-colors duration-300",
      mobile ? "block min-h-11 px-4 py-3 text-base" : "px-1 py-2 text-base",
      active ? (mobile ? "bg-white text-ink" : "text-ink") : "text-body hover:text-ink",
      mobile && !active && "hover:bg-white/70"
    );

  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-all duration-500", scrolled ? "py-2.5" : "py-4 md:py-5")}>
      <div className="mx-auto max-w-[80rem] px-4 md:px-5">
        <div
          className={cn(
            "flex items-center justify-between rounded-full py-2 pr-3 pl-3 transition-all duration-500 md:px-4",
            scrolled ? "glass shadow-glass" : "border border-transparent"
          )}
        >
          <Logo />

          <nav className="hidden items-center gap-7 lg:flex" aria-label="ناوبری اصلی">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <NavAnchor key={item.id} href={item.href} newTab={item.open_in_new_tab} className={linkClass(active)} ariaCurrent={active ? "page" : undefined}>
                  {item.label}
                  <span className={cn("absolute -bottom-1.5 right-1/2 h-[3px] w-5 translate-x-1/2 rounded-full bg-ink transition-opacity duration-300", active ? "opacity-100" : "opacity-0")} />
                </NavAnchor>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-3">
            <AccountMenu />

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "بستن منو" : "بازکردن منو"}
              aria-expanded={open}
              aria-controls="mobile-nav"
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors duration-300 hover:bg-white/70 lg:hidden"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {open && (
            <motion.nav
              id="mobile-nav"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="glass mt-2 space-y-1 rounded-3xl p-3 shadow-glass lg:hidden"
              aria-label="منوی موبایل"
            >
              {navItems.map((item) => (
                <NavAnchor key={item.id} href={item.href} newTab={item.open_in_new_tab} onClick={() => setOpen(false)} className={linkClass(isActive(item.href), true)}>
                  {item.label}
                </NavAnchor>
              ))}
              <AccountMenu mobile onNavigate={() => setOpen(false)} />
              <Link
                to="/tests"
                onClick={() => setOpen(false)}
                className="mt-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-coral px-4 text-base font-bold text-ink transition-colors hover:bg-coral-deep"
              >
                شروع مسیر من
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </motion.nav>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
