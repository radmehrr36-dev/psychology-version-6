import { useEffect, useRef, useState } from "react";
import { toFa } from "../ui";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** سقف «زیبا» برای محور عمودی با ۴ بازه‌ی مساوی */
function niceMax(max: number): number {
  if (max <= 4) return 4;
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const frac = raw / pow;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nice * pow * 4;
}

const dayFormat = new Intl.DateTimeFormat("fa-IR", { month: "short", day: "numeric", timeZone: "UTC" });
export function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : dayFormat.format(d);
}

/**
 * نمودار خطی/ناحیه‌ای چندسری. محور زمان راست‌به‌چپ است (قدیمی‌ترین روز سمت راست).
 * بدون کتابخانه؛ با Tooltip، خطوط راهنمای ظریف و برچسب‌های خوانا.
 */
export function LineAreaChart({
  days,
  series,
  height = 230,
  ariaLabel,
}: {
  days: string[];
  series: ChartSeries[];
  height?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = days.length;
  const padL = 12;
  const padR = 40;
  const padT = 14;
  const padB = 28;
  const innerW = Math.max(width - padL - padR, 10);
  const innerH = height - padT - padB;
  const rawMax = Math.max(0, ...series.flatMap((s) => s.values));
  const yMax = niceMax(rawMax);

  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : innerW * (1 - i / (n - 1)));
  const y = (v: number) => padT + innerH * (1 - v / yMax);
  const linePath = (vals: number[]) => vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const areaPath = (vals: number[]) => `${linePath(vals)} L${x(n - 1).toFixed(1)} ${padT + innerH} L${x(0).toFixed(1)} ${padT + innerH} Z`;

  const tickIdx =
    n <= 5
      ? Array.from({ length: n }, (_, i) => i)
      : [...new Set([0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round(((n - 1) * 3) / 4), n - 1])];

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const idx = Math.round((1 - (px - padL) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, idx)));
  };

  const tipLeft = hover === null ? 0 : Math.min(Math.max(x(hover), 76), Math.max(width - 76, 76));

  return (
    <div>
      <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-[13px] font-semibold text-body">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>

      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block touch-pan-y select-none">
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`area-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>

            {[0, 1, 2, 3, 4].map((t) => {
              const v = (yMax / 4) * t;
              return (
                <g key={t}>
                  <line x1={padL} x2={padL + innerW} y1={y(v)} y2={y(v)} stroke="#e8ebf0" strokeWidth="1" />
                  <text x={padL + innerW + 8} y={y(v) + 4} fontSize="12" fill="#667085">
                    {toFa(Math.round(v))}
                  </text>
                </g>
              );
            })}

            {tickIdx.map((i) => (
              <text key={i} x={x(i)} y={height - 8} fontSize="12" fill="#667085" textAnchor="middle">
                {dayLabel(days[i])}
              </text>
            ))}

            {series.map((s) => (
              <g key={s.key}>
                <path d={areaPath(s.values)} fill={`url(#area-${s.key})`} />
                <path d={linePath(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              </g>
            ))}

            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke="#c9ceda" strokeDasharray="3 3" />
                {series.map((s) => (
                  <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r="4" fill="#fff" stroke={s.color} strokeWidth="2" />
                ))}
              </g>
            )}

            <rect
              x={padL}
              y={padT}
              width={innerW}
              height={innerH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}

        {hover !== null && width > 0 && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border border-adm-line bg-white px-3 py-2 shadow-[0_8px_24px_-12px_rgb(16_24_40/0.25)]"
            style={{ left: tipLeft }}
          >
            <p className="mb-1 text-[12px] font-bold text-ink">{dayLabel(days[hover])}</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center gap-1.5 whitespace-nowrap text-[12px] text-body">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                {s.label}: <strong className="text-ink">{toFa(s.values[hover] ?? 0)}</strong>
              </p>
            ))}
          </div>
        )}
      </div>

      <p className="sr-only">
        {ariaLabel}.{" "}
        {series.map((s) => `${s.label}: مجموع ${toFa(s.values.reduce((a, b) => a + b, 0))}`).join("، ")}
      </p>
    </div>
  );
}

/** نمودار مینیاتوری روند؛ فقط وقتی داده‌ی تاریخی غیرصفر وجود دارد رسم می‌شود */
export function Sparkline({ values, color = "currentColor" }: { values: number[]; color?: string }) {
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const w = 84;
  const h = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const n = values.length;
  const pts = values.map((v, i) => `${(w * (1 - i / (n - 1))).toFixed(1)},${(h - 3 - ((v - min) / range) * (h - 6)).toFixed(1)}`);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
