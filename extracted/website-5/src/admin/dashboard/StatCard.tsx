import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Minus, TriangleAlert, type LucideIcon } from "lucide-react";
import { Card, Skeleton, toFa } from "../ui";
import { Sparkline } from "./charts";
import { cn } from "../../utils/cn";

export interface StatCardProps {
  title: string;
  value: number | null;
  icon: LucideIcon;
  tone: string;
  to?: string | null;
  href?: string;
  linkLabel?: string;
  subtitle?: string;
  delta?: { current: number; previous: number; label: string } | null;
  spark?: number[];
  sparkColor?: string;
  loading?: boolean;
  error?: string | null;
}

function DeltaBadge({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (previous === 0 && current === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f3f7] px-2 py-0.5 text-[12px] font-bold text-body" title={label}>
        <Minus className="h-3 w-3" />
        بدون تغییر
      </span>
    );
  }
  if (previous === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#e6f4ee] px-2 py-0.5 text-[12px] font-bold text-[#2f7556]" title={label}>
        <ArrowUpRight className="h-3 w-3" />
        جدید
      </span>
    );
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  const up = pct > 0;
  const flat = pct === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold",
        flat ? "bg-[#f1f3f7] text-body" : up ? "bg-[#e6f4ee] text-[#2f7556]" : "bg-[#fbeceb] text-[#a33a34]"
      )}
      title={label}
      aria-label={`${label}: ${flat ? "بدون تغییر" : `${toFa(Math.abs(pct))} درصد ${up ? "افزایش" : "کاهش"}`}`}
    >
      {flat ? <Minus className="h-3 w-3" /> : up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {toFa(Math.abs(pct))}٪
    </span>
  );
}

export function StatCard({ title, value, icon: Icon, tone, to, href, linkLabel = "مشاهده", subtitle, delta, spark, sparkColor, loading, error }: StatCardProps) {
  const linkClass =
    "inline-flex min-h-8 items-center rounded-md px-1.5 text-[13px] font-bold text-steel transition-colors duration-150 hover:bg-steel/10 focus-visible:outline-2";
  return (
    <Card className="flex flex-col p-4 transition-shadow duration-200 hover:shadow-[0_8px_24px_-14px_rgb(16_24_40/0.22)]">
      <div className="mb-3 flex items-start justify-between">
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", tone)}>
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </span>
        {to ? (
          <Link to={to} className={linkClass} aria-label={`رفتن به ${title}`}>
            {linkLabel}
          </Link>
        ) : href ? (
          <a href={href} className={linkClass} aria-label={`رفتن به ${title}`}>
            {linkLabel}
          </a>
        ) : null}
      </div>

      <p className="text-[13px] font-semibold text-body">{title}</p>

      {loading ? (
        <div className="mt-2 space-y-2" role="status" aria-label="در حال دریافت">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-4 w-32" />
        </div>
      ) : error ? (
        <>
          <p className="mt-1 text-3xl font-black text-ink/30">—</p>
          <p className="mt-2 flex items-start gap-1.5 text-[12.5px] leading-5 text-[#8a5a14] [overflow-wrap:anywhere]" role="alert">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        </>
      ) : (
        <>
          <div className="mt-1 flex items-end justify-between gap-2">
            <p className="text-3xl font-black leading-tight text-ink">{toFa(value ?? 0)}</p>
            {spark && <span style={{ color: sparkColor ?? "var(--color-steel)" }}><Sparkline values={spark} color="currentColor" /></span>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {delta && <DeltaBadge current={delta.current} previous={delta.previous} label={delta.label} />}
            {subtitle && <p className="text-[13px] leading-5 text-body">{subtitle}</p>}
          </div>
        </>
      )}
    </Card>
  );
}
