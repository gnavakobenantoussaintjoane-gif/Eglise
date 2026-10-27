import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'gold' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand text-white shadow-[0_10px_30px_-16px_rgba(76,29,149,0.9)] hover:bg-brand-royal active:translate-y-px',
  secondary: 'bg-lavender-deep text-brand hover:bg-brand-royal hover:text-white',
  outline: 'border border-brand/25 bg-white text-brand hover:border-brand/50 hover:bg-lavender',
  ghost: 'text-brand hover:bg-lavender',
  gold: 'bg-gold text-brand-dark shadow-[0_10px_30px_-16px_rgba(242,181,68,0.9)] hover:brightness-105',
  danger: 'bg-danger text-white hover:brightness-110',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
  icon: 'h-9 w-9 p-0',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, block = false, icon, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-200',
        'focus-visible:ring-2 focus-visible:ring-brand-royal focus-visible:ring-offset-2 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      disabled={props.disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-full text-brand transition hover:bg-lavender',
        'focus-visible:ring-2 focus-visible:ring-brand-royal focus-visible:outline-none',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
