/**
 * لبه‌ی منحنی بین بخش‌ها: رنگ بخش قبلی را با یک موج نرم روی بالای بخش بعدی می‌کشد.
 * استفاده: <WaveEdge from="#F6F7FC" /> داخل اولین بخش بعدی.
 */
export function WaveEdge({ from, className = "" }: { from: string; className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 z-[1] ${className}`}>
      <svg viewBox="0 0 1440 84" preserveAspectRatio="none" className="block h-9 w-full md:h-16">
        <path
          d="M0 0 H1440 V34 C1290 70 1140 12 980 34 C820 56 700 76 540 56 C400 39 240 22 0 48 Z"
          fill={from}
        />
      </svg>
    </div>
  );
}
