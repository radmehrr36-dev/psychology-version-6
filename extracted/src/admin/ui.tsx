import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "../utils/cn";
import type { PublishStatus } from "../lib/types";

/* ─────────────────────────── دکمه ─────────────────────────── */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-bold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "min-h-9 px-3 text-[12px]" : "min-h-10 px-4 text-[13px]",
        variant === "primary" && "bg-steel text-white hover:bg-steel-deep",
        variant === "secondary" && "bg-white text-ink ring-1 ring-ink/10 hover:bg-mist",
        variant === "ghost" && "text-body hover:bg-mist hover:text-ink",
        variant === "danger" && "bg-[#b4433d] text-white hover:bg-[#98362f]",
        className
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ─────────────────────────── اعلان‌ها ─────────────────────────── */
interface Toast {
  id: number;
  message: string;
  kind: "success" | "error";
}

const ToastContext = createContext<{ notify: (message: string, kind?: "success" | "error") => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const notify = useCallback((message: string, kind: "success" | "error" = "success") => {
    const id = ++counter.current;
    setToasts((prev) => [...prev.slice(-2), { id, message, kind }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[100] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-white px-4 py-3 text-[13px] font-semibold shadow-lg",
              t.kind === "success" ? "border-mint/40 text-ink" : "border-[#d9a19d] text-[#8f322d]"
            )}
          >
            {t.kind === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2f8c7c]" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#b4433d]" />
            )}
            <span className="leading-6">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

/* ─────────────────────────── کارت و سربرگ ─────────────────────────── */
export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return <div id={id} className={cn("rounded-3xl border border-white/80 bg-white/80 shadow-[0_14px_36px_-24px_rgb(45_55_110/0.34)] backdrop-blur-sm", className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: string[];
}) {
  return (
    <div className="mb-6">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="مسیر صفحه" className="mb-2 flex flex-wrap items-center gap-1.5 text-[11.5px] text-body/70">
          {breadcrumb.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true">/</span>}
              <span className={i === breadcrumb.length - 1 ? "font-bold text-ink" : ""}>{b}</span>
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-ink md:text-2xl">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-body">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/* ─────────────────────────── فرم ─────────────────────────── */
export function Field({
  label,
  hint,
  required,
  children,
  error,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-[12.5px] font-bold text-ink">
        {label}
        {required && <span className="text-[#b4433d]">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] leading-5 text-body/80">{hint}</span>}
      {error && <span className="mt-1 block text-[11.5px] font-semibold text-[#b4433d]">{error}</span>}
    </label>
  );
}

export const inputClass =
  "w-full min-h-10 rounded-lg border border-ink/12 bg-white px-3 py-2 text-[13px] text-ink placeholder:text-fog focus:border-steel focus:outline-none focus:ring-2 focus:ring-steel/15";

/* ─────────────────────────── وضعیت‌ها ─────────────────────────── */
const badgeStyles: Record<string, string> = {
  published: "bg-[#e5f4ef] text-[#2f7d6e]",
  approved: "bg-[#e5f4ef] text-[#2f7d6e]",
  active: "bg-[#e5f4ef] text-[#2f7d6e]",
  verified: "bg-[#e5f4ef] text-[#2f7d6e]",
  ok: "bg-[#e5f4ef] text-[#2f7d6e]",
  draft: "bg-[#eef1f7] text-[#5b6880]",
  unverified: "bg-[#eef1f7] text-[#5b6880]",
  in_review: "bg-[#fdf1df] text-[#9a6a24]",
  pending: "bg-[#fdf1df] text-[#9a6a24]",
  in_progress: "bg-[#fdf1df] text-[#9a6a24]",
  reviewed: "bg-[#fdf1df] text-[#9a6a24]",
  archived: "bg-[#f1eef6] text-[#6a5b85]",
  closed: "bg-[#f1eef6] text-[#6a5b85]",
  suspended: "bg-[#fbeceb] text-[#a33a34]",
  rejected: "bg-[#fbeceb] text-[#a33a34]",
  failed: "bg-[#fbeceb] text-[#a33a34]",
  urgent: "bg-[#fbeceb] text-[#a33a34]",
  answered: "bg-[#e8eefb] text-[#35578f]",
  new: "bg-[#e8eefb] text-[#35578f]",
  high: "bg-[#fdf1df] text-[#9a6a24]",
  normal: "bg-[#eef1f7] text-[#5b6880]",
  low: "bg-[#eef1f7] text-[#5b6880]",
  unconfigured: "bg-[#fdf1df] text-[#9a6a24]",
};

const labelMap: Record<string, string> = {
  draft: "پیش‌نویس",
  in_review: "در بازبینی",
  published: "منتشرشده",
  archived: "آرشیو",
  approved: "تأییدشده",
  rejected: "ردشده",
  pending: "در انتظار",
  not_required: "نیاز به بازبینی ندارد",
  active: "فعال",
  suspended: "مسدود",
  verified: "تأییدشده",
  unverified: "تأییدنشده",
  new: "جدید",
  in_progress: "در حال بررسی",
  answered: "پاسخ داده‌شده",
  closed: "بسته",
  urgent: "فوری",
  high: "بالا",
  normal: "عادی",
  low: "پایین",
  ok: "متصل",
  failed: "ناموفق",
  unconfigured: "پیکربندی نشده",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold", badgeStyles[status] ?? "bg-mist text-body", className)}>
      {labelMap[status] ?? status}
    </span>
  );
}

export function PublishBadge({ status }: { status: PublishStatus }) {
  return <StatusBadge status={status} />;
}

/* ─────────────────────────── حالت‌ها ─────────────────────────── */
export function LoadingState({ label = "در حال بارگذاری…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-[13px] font-semibold text-body" role="status">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-mist text-steel">
        <CheckCircle2 className="h-5 w-5" />
      </div>
      <p className="text-[14px] font-bold text-ink">{title}</p>
      {description && <p className="max-w-md text-[12.5px] leading-6 text-body">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center" role="alert">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fbeceb] text-[#a33a34]">
        <AlertCircle className="h-5 w-5" />
      </div>
      <p className="max-w-md text-[13px] font-semibold leading-6 text-ink [overflow-wrap:anywhere]">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          تلاش دوباره
        </Button>
      )}
    </div>
  );
}

export function AccessDenied({ note }: { note?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#fbeceb] text-[#a33a34]">
        <ShieldAlert className="h-6 w-6" />
      </div>
      <p className="text-[15px] font-extrabold text-ink">دسترسی به این بخش مجاز نیست</p>
      <p className="max-w-md text-[12.5px] leading-6 text-body">
        {note ?? "نقش شما مجوز لازم برای مشاهده یا تغییر این بخش را ندارد. در صورت نیاز با مدیر ارشد هماهنگ کنید."}
      </p>
    </div>
  );
}

/* ─────────────────────────── دیالوگ تأیید ─────────────────────────── */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "تأیید و ادامه",
  dangerous,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  dangerous?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/30 p-4" onClick={onCancel}>
      <div role="alertdialog" aria-modal="true" aria-label={title} className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 text-[15px] font-extrabold text-ink">{title}</h2>
        <p className="mb-5 text-[12.5px] leading-6 text-body">{description}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            انصراف
          </Button>
          <Button variant={dangerous ? "danger" : "primary"} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── صفحه‌بندی ─────────────────────────── */
export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/8 px-4 py-3 text-[12px] text-body">
      <span>
        {total.toLocaleString("fa-IR")} رکورد — صفحه‌ی {(page + 1).toLocaleString("fa-IR")} از {pages.toLocaleString("fa-IR")}
      </span>
      <div className="flex gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => onPage(Math.max(0, page - 1))} disabled={page === 0}>
          قبلی
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onPage(Math.min(pages - 1, page + 1))} disabled={page >= pages - 1}>
          بعدی
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────── جدول ─────────────────────────── */
export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  error,
  onRetry,
  emptyTitle = "داده‌ای ثبت نشده است",
  emptyDescription,
  rowActions,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  rowActions?: (row: T) => ReactNode;
}) {
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  const [primary, ...rest] = columns;

  return (
    <>
      {/* دسکتاپ و تبلت: جدول */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] text-right">
          <thead>
            <tr className="border-b border-adm-line bg-[#f8f9fb]">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("whitespace-nowrap px-4 py-3 text-[12px] font-bold text-body", c.className)}>
                  {c.header}
                </th>
              ))}
              {rowActions && (
                <th scope="col" className="px-4 py-3 text-[12px] font-bold text-body">
                  عملیات
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-adm-line/70 transition-colors duration-150 last:border-0 hover:bg-[#f8f9fc]">
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-3 align-middle text-[13px] text-ink", c.className)}>
                    {c.render(row)}
                  </td>
                ))}
                {rowActions && <td className="px-4 py-3 align-middle">{rowActions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* موبایل: فهرست کارتی (همان ستون‌ها، همان عملیات) */}
      <ul className="divide-y divide-adm-line md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="space-y-2.5 px-4 py-3.5">
            {primary && <div className="min-w-0 text-[13px] text-ink">{primary.render(row)}</div>}
            {rest.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                {rest.map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-[12px] font-semibold text-body">{c.header}</dt>
                    <dd className="mt-0.5 min-w-0 break-words text-[13px] text-ink">{c.render(row)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {rowActions && <div className="flex flex-wrap items-center gap-1 border-t border-adm-line/70 pt-2.5">{rowActions(row)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}

/* ─────────────────────────── ابزارهای قالب‌بندی ─────────────────────────── */
export function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "۰ بایت";
  const units = ["بایت", "کیلوبایت", "مگابایت", "گیگابایت"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} ${units[i]}`;
}

export function toFa(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("fa-IR");
}

/* ─────────────────────────── Skeleton / Tooltip / زمان نسبی ─────────────────────────── */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("adm-skeleton rounded-lg", className)} />;
}

export function Tooltip({ label, children, side = "bottom" }: { label: string; children: ReactNode; side?: "bottom" | "top" }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2.5 py-1 text-[12px] font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100",
          side === "bottom" ? "top-full mt-2" : "bottom-full mb-2"
        )}
      >
        {label}
      </span>
    </span>
  );
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = (t - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("fa", { numeric: "auto" });
  if (abs < 60) return "هم‌اکنون";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(value);
}
