import { Link } from "react-router-dom";
import { Activity, ArrowLeft, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { Card, EmptyState, Skeleton, formatDate, formatRelative } from "../ui";
import type { AuditLog } from "../../lib/types";

const actionLabels: Record<string, string> = {
  insert: "ایجاد",
  update: "ویرایش",
  delete: "حذف",
  publish: "انتشار",
  approve: "تأیید",
  suspend: "مسدودسازی",
  activate: "فعال‌سازی",
  invite: "دعوت",
  role_change: "تغییر نقش",
  revoke_admin: "لغو دسترسی مدیریتی",
  add_note: "ثبت یادداشت",
  reply: "پاسخ",
  service_check: "بررسی اتصال سرویس",
  bootstrap: "راه‌اندازی اولیه",
};

const resourceLabels: Record<string, string> = {
  tests: "آزمون",
  test_versions: "نسخه‌ی آزمون",
  pages: "صفحه",
  site_sections: "بخش سایت",
  articles: "مقاله",
  magazines: "مجله",
  books: "کتاب",
  media: "رسانه",
  profiles: "حساب کاربری",
  service_settings: "تنظیمات سرویس",
  role_permissions: "مجوز نقش",
  psychologist_documents: "مدرک متخصص",
  admins: "مدیران",
  support_messages: "پیام پشتیبانی",
};

export const labelAction = (a: string) => actionLabels[a] ?? a;
export const labelResource = (r: string) => resourceLabels[r] ?? r;

export function ActivityFeed({ logs, loading }: { logs: AuditLog[]; loading: boolean }) {
  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-adm-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
          <Activity className="h-4.5 w-4.5 text-steel" />
          فعالیت‌های مدیریتی اخیر
        </h2>
        <Link to="/admin/audit-logs" className="flex min-h-9 items-center gap-1 text-[13px] font-bold text-steel hover:underline">
          همه‌ی رویدادها
          <ArrowLeft className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading ? (
        <ul className="divide-y divide-adm-line" role="status" aria-label="در حال دریافت">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3.5 w-1/3" />
              </div>
            </li>
          ))}
        </ul>
      ) : logs.length === 0 ? (
        <EmptyState title="هنوز رویدادی ثبت نشده است" description="پس از انجام عملیات مدیریتی (انتشار، ویرایش، تأیید و…) اینجا نمایش داده می‌شود." />
      ) : (
        <ul className="divide-y divide-adm-line">
          {logs.map((log) => {
            const ok = log.result === "success";
            return (
              <li key={log.id} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-[#f8f9fc]">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ok ? "bg-[#e6f4ee] text-[#2f7556]" : "bg-[#fbeceb] text-[#a33a34]"}`}>
                  {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1 basis-44">
                  <p className="text-[14px] font-bold text-ink">
                    {labelAction(log.action)} <span className="font-semibold text-body">· {labelResource(log.resource_type)}</span>
                  </p>
                  {log.actor_email && (
                    <p dir="ltr" className="truncate text-left text-[12.5px] text-body">
                      {log.actor_email}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${ok ? "bg-[#e6f4ee] text-[#2f7556]" : "bg-[#fbeceb] text-[#a33a34]"}`}>{ok ? "موفق" : "ناموفق"}</span>
                  <span className="flex items-center gap-1 text-[12.5px] text-body" title={formatDate(log.created_at, true)}>
                    <Clock3 className="h-3 w-3" />
                    {formatRelative(log.created_at)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
