import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Bot, CheckCheck, FileText, MessageSquare, Stethoscope, TriangleAlert, type LucideIcon } from "lucide-react";
import { Skeleton, Tooltip, formatDate, formatRelative, toFa } from "./ui";
import { useAttention, type AttentionKind } from "./dashboard/attention";
import { useAdminPrefs } from "./prefs";
import { useDismiss } from "./useDismiss";
import { cn } from "../utils/cn";

const kindIcon: Record<AttentionKind, LucideIcon> = {
  support: MessageSquare,
  psychologists: Stethoscope,
  tests: Bot,
  content: FileText,
};

/** اعلان‌ها از داده‌ی واقعی (پیام‌های جدید، مدارک در انتظار، نسخه‌های در بازبینی، محتوای در انتظار تأیید) ساخته می‌شوند */
export function NotificationCenter() {
  const { items, loading, reads, readsAvailable, markRead, errors } = useAttention();
  const { prefs } = useAdminPrefs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const list = useMemo(
    () =>
      items
        .filter((i) => i.needsAction && prefs.notifications[i.kind])
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 30),
    [items, prefs.notifications]
  );
  const unread = list.filter((i) => !reads.has(i.key));
  const hasError = Object.keys(errors).length > 0;

  return (
    <div ref={ref} className="relative">
      <Tooltip label="اعلان‌ها">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={unread.length > 0 ? `اعلان‌ها — ${toFa(unread.length)} خوانده‌نشده` : "اعلان‌ها"}
          aria-expanded={open}
          aria-haspopup="dialog"
          className={cn(
            "relative flex h-10 w-10 items-center justify-center rounded-xl text-ink transition-colors duration-150 hover:bg-mist",
            open && "bg-mist"
          )}
        >
          <Bell className="h-5 w-5" strokeWidth={1.8} />
          {unread.length > 0 && (
            <span className="absolute -top-0.5 left-0 flex min-w-[1.15rem] items-center justify-center rounded-full bg-[#d9604f] px-1 text-[11px] font-extrabold leading-[1.15rem] text-white">
              {unread.length > 9 ? `${toFa(9)}+` : toFa(unread.length)}
            </span>
          )}
        </button>
      </Tooltip>

      {open && (
        <div
          role="dialog"
          aria-label="مرکز اعلان‌ها"
          className="fixed inset-x-3 top-[3.75rem] z-50 overflow-hidden rounded-2xl border border-adm-line bg-white shadow-[0_16px_40px_-16px_rgb(16_24_40/0.3)] sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-[24rem]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-adm-line px-4 py-3">
            <h2 className="text-[15px] font-extrabold text-ink">
              اعلان‌ها
              {unread.length > 0 && <span className="ms-2 rounded-full bg-[#fbe4e0] px-2 py-0.5 text-[12px] font-bold text-[#a33a34]">{toFa(unread.length)} جدید</span>}
            </h2>
            <button
              type="button"
              onClick={() => void markRead(unread.map((i) => i.key))}
              disabled={unread.length === 0}
              className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-steel transition-colors duration-150 hover:bg-steel/10 disabled:text-body/60 disabled:hover:bg-transparent"
            >
              <CheckCheck className="h-4 w-4" />
              خوانده شد
            </button>
          </div>

          <div className="max-h-[min(65vh,26rem)] overflow-y-auto">
            {loading ? (
              <ul className="space-y-3 p-4" role="status" aria-label="در حال دریافت">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3.5 w-1/3" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : list.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <CheckCheck className="mx-auto mb-2 h-6 w-6 text-[#63a88a]" />
                <p className="text-[14px] font-bold text-ink">اعلان جدیدی ندارید</p>
                <p className="mt-1 text-[13px] leading-6 text-body">
                  {hasError ? "دریافت بخشی از اعلان‌ها با خطا مواجه شد؛ جزئیات در داشبورد دیده می‌شود." : "همه‌ی موارد بررسی شده‌اند."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-adm-line">
                {list.map((item) => {
                  const Icon = kindIcon[item.kind];
                  const isUnread = !reads.has(item.key);
                  return (
                    <li key={item.key}>
                      <Link
                        to={item.href}
                        onClick={() => {
                          void markRead([item.key]);
                          close();
                        }}
                        className={cn(
                          "flex items-start gap-3 px-4 py-3 transition-colors duration-150 hover:bg-[#f8f9fc] focus-visible:bg-[#f8f9fc]",
                          isUnread && "bg-steel/[0.04]"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                            item.critical ? "bg-[#fbe4e0] text-[#a33a34]" : "bg-steel/10 text-steel"
                          )}
                        >
                          {item.critical ? <TriangleAlert className="h-4 w-4" /> : <Icon className="h-4 w-4" strokeWidth={1.8} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-[14px] text-ink", isUnread ? "font-extrabold" : "font-semibold")}>{item.title}</span>
                          <span className="mt-0.5 block text-[13px] text-body" title={formatDate(item.at, true)}>
                            {item.subject} · {formatRelative(item.at)}
                          </span>
                        </span>
                        {isUnread && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-steel" aria-label="خوانده‌نشده" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {!readsAvailable && (
            <p className="border-t border-adm-line bg-[#fdf6e8] px-4 py-2 text-[12.5px] leading-5 text-[#8a5a14]">
              وضعیت «خوانده‌شده» فعلاً فقط در همین نشست نگه‌داری می‌شود؛ برای ذخیره در حساب، migration داشبورد را اجرا کنید.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
