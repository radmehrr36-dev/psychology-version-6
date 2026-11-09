import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, RefreshCw, ShieldCheck, UserPlus } from "lucide-react";
import { friendlyError, supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import {
  AccessDenied,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  StatusBadge,
  formatDate,
  inputClass,
  useToast,
  type Column,
} from "../ui";
import { roleLabels, type AdminInvite, type AppRole, type Profile, type RolePermission } from "../../lib/types";

const ROLES = Object.keys(roleLabels) as AppRole[];
const MANAGEABLE = ROLES.filter((r) => r !== "super_admin");

const RESOURCES = [
  { key: "content", label: "محتوا (صفحه، مقاله، مجله، کتاب)" },
  { key: "tests", label: "آزمون‌ها" },
  { key: "media", label: "رسانه‌ها" },
  { key: "users", label: "کاربران" },
  { key: "admins", label: "مدیران و نقش‌ها" },
  { key: "support", label: "پشتیبانی" },
  { key: "psychologists", label: "متخصصان" },
  { key: "settings", label: "تنظیمات" },
  { key: "audit", label: "رویدادها" },
];

const ACTIONS = ["read", "write", "delete", "publish", "review"] as const;
const ACTION_LABELS: Record<string, string> = {
  read: "خواندن",
  write: "ایجاد/ویرایش",
  delete: "حذف",
  publish: "انتشار",
  review: "بازبینی",
};

export function AdminsPage() {
  const { profile: me, can } = useAuth();
  const { notify } = useToast();
  const canWrite = can("admins", "write");
  const canRead = can("admins", "read");

  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("content_manager");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [roleTarget, setRoleTarget] = useState<{ user: Profile; role: AppRole | null } | null>(null);
  const [matrixRole, setMatrixRole] = useState<AppRole>("content_manager");
  const [matrix, setMatrix] = useState<RolePermission[]>([]);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [adminRows, setAdminRows] = useState<Profile[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(true);
  const [adminsError, setAdminsError] = useState<string | null>(null);

  const loadAdmins = useCallback(async () => {
    if (!supabase || !canRead) return;
    setAdminsLoading(true);
    setAdminsError(null);
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,full_name,avatar_url,role,account_status,last_seen_at,created_at,updated_at")
      .not("role", "is", null)
      .order("created_at", { ascending: true });
    setAdminsLoading(false);
    if (error) {
      setAdminsError(friendlyError(error));
      return;
    }
    setAdminRows((data ?? []) as Profile[]);
  }, [canRead]);

  const loadInvites = useCallback(async () => {
    if (!supabase || !canRead) return;
    setInvitesLoading(true);
    const { data } = await supabase
      .from("admin_invites")
      .select("id,email,role,status,invited_by_email,expires_at,created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setInvites((data ?? []) as AdminInvite[]);
    setInvitesLoading(false);
  }, [canRead]);

  const loadMatrix = useCallback(async (role: AppRole) => {
    if (!supabase || !canWrite) return;
    setMatrixLoading(true);
    const { data, error } = await supabase.from("role_permissions").select("id,role,resource,action").eq("role", role);
    setMatrixLoading(false);
    if (error) {
      notify(friendlyError(error), "error");
      return;
    }
    setMatrix((data ?? []) as RolePermission[]);
  }, [canWrite, notify]);

  useEffect(() => {
    void loadAdmins();
    void loadInvites();
  }, [loadAdmins, loadInvites]);

  useEffect(() => {
    if (canWrite) void loadMatrix(matrixRole);
  }, [canWrite, matrixRole, loadMatrix]);

  const invokeAdmin = async (body: Record<string, unknown>) => {
    if (!supabase) throw new Error("Supabase پیکربندی نشده است");
    const { data, error } = await supabase.functions.invoke("admin", { body });
    if (error) {
      const msg = await (async () => {
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx) {
            const parsed = await ctx.json();
            return typeof parsed?.error === "string" ? parsed.error : error.message;
          }
        } catch {
          /* ignore */
        }
        return error.message;
      })();
      if (/Failed to send a request|not found|404/i.test(msg)) {
        throw new Error("تابع مدیریتی مستقر نشده است. با دستور «supabase functions deploy admin» آن را فعال کنید.");
      }
      throw new Error(msg);
    }
    return data;
  };

  const sendInvite = async () => {
    setFormError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())) {
      setFormError("ایمیل معتبر وارد کنید.");
      return;
    }
    setBusy(true);
    try {
      await invokeAdmin({ action: "invite_admin", payload: { email: inviteEmail.trim(), role: inviteRole } });
      notify("دعوت مدیر ارسال شد (از طریق ایمیل Supabase).");
      setInviteOpen(false);
      setInviteEmail("");
      await Promise.all([loadAdmins(), loadInvites()]);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "ارسال دعوت ناموفق بود.");
    } finally {
      setBusy(false);
    }
  };

  const applyRole = async () => {
    if (!roleTarget) return;
    setBusy(true);
    try {
      await invokeAdmin({ action: "set_admin_role", payload: { user_id: roleTarget.user.id, role: roleTarget.role } });
      notify(roleTarget.role ? "نقش مدیر به‌روزرسانی شد." : "دسترسی مدیریتی لغو شد.");
      setRoleTarget(null);
      await Promise.all([loadAdmins(), loadInvites()]);
    } catch (e) {
      notify(e instanceof Error ? e.message : "تغییر نقش ناموفق بود.", "error");
    } finally {
      setBusy(false);
    }
  };

  const togglePermission = async (resource: string, action: string, checked: boolean) => {
    if (!supabase) return;
    const existing = matrix.find((m) => m.resource === resource && m.action === action);
    if (checked && !existing) {
      const optimistic: RolePermission = { id: `temp-${resource}-${action}`, role: matrixRole, resource, action };
      setMatrix((prev) => [...prev, optimistic]);
      const { data, error } = await supabase
        .from("role_permissions")
        .insert({ role: matrixRole, resource, action })
        .select("id,role,resource,action")
        .single();
      if (error) {
        setMatrix((prev) => prev.filter((p) => p.id !== optimistic.id));
        notify(friendlyError(error), "error");
        return;
      }
      setMatrix((prev) => prev.map((p) => (p.id === optimistic.id ? (data as RolePermission) : p)));
      notify("مجوز افزوده شد.");
    } else if (!checked && existing) {
      setMatrix((prev) => prev.filter((p) => p.id !== existing.id));
      const { error } = await supabase.from("role_permissions").delete().eq("id", existing.id);
      if (error) {
        setMatrix((prev) => [...prev, existing]);
        notify(friendlyError(error), "error");
        return;
      }
      notify("مجوز حذف شد.");
    }
  };

  const columns: Column<Profile>[] = [
    {
      key: "admin",
      header: "مدیر",
      render: (p) => (
        <div>
          <p className="text-[12.5px] font-bold text-ink">{p.full_name || "بدون نام"}</p>
          <p dir="ltr" className="text-left text-[11px] text-body">{p.email}</p>
        </div>
      ),
    },
    { key: "role", header: "نقش", render: (p) => <span className="text-[12px] font-semibold">{p.role ? roleLabels[p.role as AppRole] : "—"}</span> },
    { key: "status", header: "وضعیت", render: (p) => <StatusBadge status={p.account_status} /> },
    {
      key: "actions",
      header: "تغییر نقش",
      render: (p) => (
        <select
          className="min-h-9 rounded-md border border-ink/12 bg-white px-2 text-[11.5px]"
          value={p.role ?? ""}
          disabled={!canWrite || p.id === me?.id}
          aria-label={`نقش ${p.email ?? ""}`}
          onChange={(e) => setRoleTarget({ user: p, role: (e.target.value || null) as AppRole | null })}
        >
          <option value="">بدون دسترسی مدیریتی</option>
          {MANAGEABLE.map((r) => (
            <option key={r} value={r}>{roleLabels[r]}</option>
          ))}
          {p.role === "super_admin" && <option value="super_admin">{roleLabels.super_admin}</option>}
        </select>
      ),
    },
  ];

  const groupedMatrix = useMemo(
    () =>
      RESOURCES.map((r) => ({
        ...r,
        permissions: ACTIONS.map((a) => ({ action: a, granted: matrix.some((m) => m.resource === r.key && m.action === a) })),
      })),
    [matrix]
  );

  if (!canRead) return <AccessDenied />;

  return (
    <>
      <PageHeader
        title="مدیران و دسترسی‌ها"
        description="نقش‌ها در پایگاه داده نگهداری می‌شوند و تغییر آن‌ها فقط از مسیر امن سرور (Edge Function) انجام می‌شود. ثبت‌نام عمومی مدیر وجود ندارد."
        actions={
          canWrite ? (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4" />
              دعوت مدیر جدید
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/8 px-4 py-3">
            <h2 className="flex items-center gap-2 text-[13px] font-extrabold text-ink">
              <ShieldCheck className="h-4 w-4 text-steel" />
              مدیران فعال
            </h2>
            <Button variant="ghost" size="sm" onClick={() => void loadAdmins()}>
              <RefreshCw className="h-3.5 w-3.5" />
              به‌روزرسانی
            </Button>
          </div>
          <DataTable
            columns={columns}
            rows={adminRows}
            loading={adminsLoading}
            error={adminsError}
            onRetry={loadAdmins}
            emptyTitle="مدیری ثبت نشده است"
            emptyDescription="اولین مدیر ارشد را با اسکریپت امن bootstrap بسازید؛ پس از آن دعوت مدیران از همین صفحه انجام می‌شود."
          />
          <p className="border-t border-ink/8 px-4 py-2.5 text-[11px] leading-5 text-body">
            نقش «مدیر ارشد» از این جدول قابل تغییر نیست و تنها راه تغییر آن اسکریپت/bootstrap مجاز است. تغییر سایر
            نقش‌ها در audit log ثبت می‌شود.
          </p>
        </Card>

        <Card>
          <div className="border-b border-ink/8 px-4 py-3">
            <h2 className="text-[13px] font-extrabold text-ink">دعوت‌های مدیران</h2>
          </div>
          {invitesLoading ? (
            <LoadingState label="دریافت دعوت‌ها…" />
          ) : invites.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] leading-6 text-body">دعوتی ثبت نشده است.</div>
          ) : (
            <ul className="divide-y divide-ink/5">
              {invites.map((inv) => (
                <li key={inv.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p dir="ltr" className="truncate text-left text-[11.5px] font-semibold text-ink">{inv.email}</p>
                    <StatusBadge status={inv.status === "pending" ? "pending" : inv.status === "accepted" ? "active" : "archived"} />
                  </div>
                  <p className="mt-1 text-[10.5px] text-body">
                    {roleLabels[inv.role]} · {formatDate(inv.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {canWrite && (
        <Card className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/8 px-4 py-3">
            <div>
              <h2 className="flex items-center gap-2 text-[13px] font-extrabold text-ink">
                <KeyRound className="h-4 w-4 text-steel" />
                ماتریس مجوزهای نقش‌ها
              </h2>
              <p className="mt-0.5 text-[11px] text-body">مدیر ارشد همیشه دسترسی کامل دارد. تغییرات مستقیماً در RLS اعمال می‌شوند.</p>
            </div>
            <select
              value={matrixRole}
              onChange={(e) => setMatrixRole(e.target.value as AppRole)}
              className="min-h-9 rounded-md border border-ink/12 bg-white px-2 text-[12px] font-semibold"
              aria-label="انتخاب نقش برای ویرایش مجوزها"
            >
              {MANAGEABLE.map((r) => (
                <option key={r} value={r}>{roleLabels[r]}</option>
              ))}
            </select>
          </div>

          {matrixLoading ? (
            <LoadingState />
          ) : (
            <div className="overflow-x-auto p-1">
              <table className="w-full min-w-[720px] text-right">
                <thead>
                  <tr className="border-b border-ink/8">
                    <th className="px-3 py-2 text-[11.5px] font-bold text-body">منبع</th>
                    {ACTIONS.map((a) => (
                      <th key={a} className="px-2 py-2 text-center text-[11.5px] font-bold text-body">{ACTION_LABELS[a]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupedMatrix.map((row) => (
                    <tr key={row.key} className="border-b border-ink/5 last:border-0">
                      <td className="px-3 py-2 text-[12px] font-semibold text-ink">{row.label}</td>
                      {row.permissions.map((p) => (
                        <td key={p.action} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={p.granted}
                            onChange={(e) => void togglePermission(row.key, p.action, e.target.checked)}
                            className="h-4 w-4 accent-[#4a58a6]"
                            aria-label={`${ACTION_LABELS[p.action]} ${row.label}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {inviteOpen && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-ink/30 p-4" onClick={() => !busy && setInviteOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="دعوت مدیر جدید" className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-[15px] font-extrabold text-ink">دعوت مدیر جدید</h2>
            <p className="mb-4 text-[11.5px] leading-6 text-body">
              دعوت از طریق Supabase Auth ایمیل می‌شود. نقش کاربر فقط پس از تأیید سرور اعمال می‌گردد.
            </p>
            <div className="space-y-3">
              <Field label="ایمیل" required hint="ایمیل سازمانی معتبر وارد کنید.">
                <input type="email" dir="ltr" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className={`${inputClass} text-left`} placeholder="name@example.com" />
              </Field>
              <Field label="نقش" required>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as AppRole)} className={inputClass}>
                  {MANAGEABLE.map((r) => (
                    <option key={r} value={r}>{roleLabels[r]}</option>
                  ))}
                </select>
              </Field>
              {formError && <ErrorState message={formError} />}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setInviteOpen(false)} disabled={busy}>انصراف</Button>
              <Button onClick={() => void sendInvite()} loading={busy}>ارسال دعوت</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(roleTarget)}
        title={roleTarget?.role ? "تغییر نقش مدیر" : "لغو دسترسی مدیریتی"}
        description={
          roleTarget?.role
            ? `نقش «${roleTarget.user.email}» به «${roleLabels[roleTarget.role]}» تغییر می‌کند. این تغییر بلافاصله در RLS اعمال و در audit log ثبت می‌شود.`
            : `دسترسی مدیریتی «${roleTarget?.user.email}» لغو می‌شود. حساب کاربری حذف نمی‌شود. ادامه می‌دهید؟`
        }
        dangerous={!roleTarget?.role}
        busy={busy}
        onCancel={() => setRoleTarget(null)}
        onConfirm={() => void applyRole()}
      />
    </>
  );
}
