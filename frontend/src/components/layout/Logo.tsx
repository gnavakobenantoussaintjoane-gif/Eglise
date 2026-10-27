import { Link } from 'react-router-dom';
import { cn } from '../../utils/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn('h-9 w-9', className)} aria-hidden="true">
      <defs>
        <linearGradient id="logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand-royal)" />
          <stop offset="1" stopColor="var(--brand-primary)" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#logo-gradient)" />
      <path
        d="M24 9l11 6.4v10.9c0 7.2-4.7 12.3-11 14.7-6.3-2.4-11-7.5-11-14.7V15.4L24 9z"
        fill="none"
        stroke="#f5f3ff"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M24 18.5v10M19.5 23.5h9" stroke="#c4b5fd" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({
  name,
  slogan,
  logoUrl,
  className,
  inverted = false,
}: {
  name: string;
  slogan?: string;
  logoUrl?: string | null;
  className?: string;
  inverted?: boolean;
}) {
  return (
    <Link
      to="/"
      className={cn('group inline-flex items-center gap-3 rounded-xl', className)}
      aria-label={`${name} — accueil`}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="h-10 w-10 rounded-xl object-contain" />
      ) : (
        <LogoMark className="h-10 w-10 transition group-hover:scale-105" />
      )}
      <span className="flex flex-col leading-tight">
        <span
          className={cn(
            'font-display text-[1.05rem] font-semibold tracking-tight',
            inverted ? 'text-white' : 'text-brand-dark',
          )}
        >
          {name}
        </span>
        {slogan ? (
          <span className={cn('text-[0.68rem] font-medium tracking-wide uppercase', inverted ? 'text-white/70' : 'text-muted')}>
            {slogan}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
