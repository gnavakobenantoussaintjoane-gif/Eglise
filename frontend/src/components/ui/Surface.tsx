import type { ElementType, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { initials } from '../../utils/format';

export function Card({
  children,
  className,
  as: Component = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}) {
  return <Component className={cn('surface p-5 sm:p-6', className)}>{children}</Component>;
}

const BADGE_TONES = {
  brand: 'bg-brand/10 text-brand ring-brand/15',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  gold: 'bg-amber-100 text-amber-900 ring-amber-200',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({
  firstName,
  lastName,
  src,
  size = 'md',
  className,
}: {
  firstName?: string;
  lastName?: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const sizes = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-base',
    xl: 'h-20 w-20 text-xl',
  };
  if (src) {
    return (
      <img
        src={src}
        alt={`Photo de ${firstName ?? ''} ${lastName ?? ''}`.trim()}
        className={cn('shrink-0 rounded-full object-cover ring-2 ring-white', sizes[size], className)}
        loading="lazy"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-brand-royal font-semibold text-white ring-2 ring-white',
        sizes[size],
        className,
      )}
    >
      {initials(firstName, lastName)}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-line bg-lavender/60">
      <div className="container-page flex flex-col gap-5 py-10 sm:py-14">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl space-y-3">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h1 className="text-3xl font-semibold text-brand-dark sm:text-4xl">{title}</h1>
            {description ? <p className="text-base leading-relaxed text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        {children}
      </div>
    </header>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  align = 'left',
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  align?: 'left' | 'center';
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        align === 'center' && 'sm:flex-col sm:items-center sm:text-center',
      )}
    >
      <div className={cn('max-w-2xl space-y-2', align === 'center' && 'mx-auto text-center')}>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 className="text-2xl font-semibold text-brand-dark sm:text-3xl">{title}</h2>
        {description ? <p className="text-sm leading-relaxed text-muted sm:text-base">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: 'brand' | 'gold' | 'success' | 'danger';
}) {
  const tones = {
    brand: 'bg-brand/10 text-brand',
    gold: 'bg-amber-100 text-amber-700',
    success: 'bg-emerald-50 text-emerald-700',
    danger: 'bg-red-50 text-red-700',
  };
  return (
    <div className="surface flex items-start justify-between gap-3 p-5">
      <div className="space-y-1">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
        <p className="font-display text-2xl font-semibold text-brand-dark">{value}</p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
      {icon ? (
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
          {icon}
        </span>
      ) : null}
    </div>
  );
}

export function PaginationControls({
  page,
  totalPages,
  onChange,
  className,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className={cn('flex items-center justify-center gap-2 pt-8', className)} aria-label="Pagination">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="inline-flex h-9 items-center gap-1 rounded-full border border-line px-3 text-sm text-brand transition hover:bg-lavender disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Précédent
      </button>
      <span className="px-2 text-sm text-muted">
        Page {page} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="inline-flex h-9 items-center gap-1 rounded-full border border-line px-3 text-sm text-brand transition hover:bg-lavender disabled:opacity-40"
      >
        Suivant <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  );
}

export function MoreLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="group inline-flex items-center gap-1.5 text-sm font-semibold text-brand-royal transition hover:text-brand"
    >
      {children}
      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}
