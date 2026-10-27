import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { Spinner } from '../ui';

export function AdminHeading({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {description ? <p className="max-w-2xl text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
  to,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info';
  to?: string;
}) {
  const tones = {
    brand: 'bg-lavender text-brand',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-800',
    danger: 'bg-red-50 text-red-700',
    info: 'bg-sky-50 text-sky-700',
  };
  const content = (
    <div className="surface flex items-start justify-between gap-3 p-4 transition hover:shadow-[var(--shadow-card)]">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted">{label}</p>
        <p className="font-display text-2xl font-semibold text-ink">{value}</p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
      {icon ? (
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', tones[tone])}>
          {icon}
        </span>
      ) : null}
    </div>
  );
  return to ? <a href={to}>{content}</a> : content;
}

export function TableShell({
  children,
  loading,
  empty,
  columns,
}: {
  children: ReactNode;
  loading?: boolean;
  empty?: ReactNode;
  columns: string[];
}) {
  return (
    <div className="surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line bg-lavender/60">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">{children}</tbody>
        </table>
      </div>
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
          <Spinner /> Chargement…
        </div>
      ) : null}
      {!loading && empty ? empty : null}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-end gap-3">{children}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-ink">{label}</span>
      {children}
    </div>
  );
}
