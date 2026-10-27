import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from 'lucide-react';
import { cn } from '../../utils/cn';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand-royal', className)} aria-hidden="true" />;
}

export function LoadingBlock({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-sm text-muted">
      <Spinner className="h-6 w-6" />
      <span role="status">{label}</span>
    </div>
  );
}

const ALERT_TONES = {
  info: { wrap: 'border-brand/20 bg-lavender text-brand-dark', Icon: Info },
  success: { wrap: 'border-success/25 bg-success/8 text-success', Icon: CheckCircle2 },
  warning: { wrap: 'border-warning/30 bg-warning/8 text-warning', Icon: TriangleAlert },
  danger: { wrap: 'border-danger/25 bg-danger/8 text-danger', Icon: AlertCircle },
};

export function Alert({
  tone = 'info',
  title,
  children,
  className,
  role,
}: {
  tone?: keyof typeof ALERT_TONES;
  title?: string;
  children: ReactNode;
  className?: string;
  role?: 'alert' | 'status' | 'note';
}) {
  const { wrap, Icon } = ALERT_TONES[tone];
  return (
    <div
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
      className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm', wrap, className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className="leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-lavender/40 px-6 py-14 text-center',
        className,
      )}
    >
      {icon ? <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-brand-royal">{icon}</div> : null}
      <div className="space-y-1">
        <p className="font-display text-lg font-semibold text-ink">{title}</p>
        {description ? <p className="mx-auto max-w-md text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-lavender-deep/80', className)} aria-hidden="true" />;
}

export function SkeletonGrid({ items = 6 }: { items?: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className="surface overflow-hidden">
          <Skeleton className="h-44 w-full rounded-none" />
          <div className="space-y-2 p-5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
