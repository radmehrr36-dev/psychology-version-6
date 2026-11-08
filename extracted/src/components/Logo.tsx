export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="currentColor" aria-hidden="true">
      <path d="M20 2.5c4.6 5.6 4.6 10.9 0 16-4.6-5.1-4.6-10.4 0-16Z" />
      <path d="M20 37.5c-4.6-5.6-4.6-10.9 0-16 4.6 5.1 4.6 10.4 0 16Z" />
      <path d="M2.5 20c5.6-4.6 10.9-4.6 16 0-5.1 4.6-10.4 4.6-16 0Z" />
      <path d="M37.5 20c-5.6 4.6-10.9 4.6-16 0 5.1-4.6 10.4-4.6 16 0Z" />
      <circle cx="20" cy="20" r="3.4" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <a href="/#top" className="flex items-center gap-2.5">
      <LogoMark className="h-9 w-9 text-steel" />
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[19px] font-extrabold tracking-tight text-ink">آریاسازه</span>
          <span className="block text-[14px] font-medium text-body">به سوی شکوفه پنهان تو</span>
        </span>
      )}
    </a>
  );
}
