import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

interface FieldShellProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

export function FieldShell({ label, htmlFor, hint, error, required, children }: FieldShellProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="field-label">
        {label}
        {required ? (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="field-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  /** Classes appliquées au conteneur (utile pour la largeur en grille). */
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, containerClassName, id, required, ...props },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const control = (
    <input
      ref={ref}
      id={inputId}
      className={cn('field-control', error && 'border-danger', className)}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
      required={required}
      {...props}
    />
  );
  if (!label) {
    return containerClassName ? <div className={containerClassName}>{control}</div> : control;
  }
  return (
    <div className={containerClassName}>
      <FieldShell label={label} htmlFor={inputId} hint={hint} error={error} required={required}>
        {control}
      </FieldShell>
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, containerClassName, id, rows = 4, required, ...props },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const control = (
    <textarea
      ref={ref}
      id={inputId}
      rows={rows}
      className={cn('field-control resize-y', error && 'border-danger', className)}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
      required={required}
      {...props}
    />
  );
  if (!label) {
    return containerClassName ? <div className={containerClassName}>{control}</div> : control;
  }
  return (
    <div className={containerClassName}>
      <FieldShell label={label} htmlFor={inputId} hint={hint} error={error} required={required}>
        {control}
      </FieldShell>
    </div>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, placeholder, className, containerClassName, id, required, ...props },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const control = (
    <select
      ref={ref}
      id={inputId}
      className={cn('field-control appearance-none bg-[length:1rem] pr-9', error && 'border-danger', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236b6485'%3E%3Cpath d='M5.5 7.5 10 12l4.5-4.5'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.75rem center',
      }}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
      required={required}
      {...props}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
  if (!label) {
    return containerClassName ? <div className={containerClassName}>{control}</div> : control;
  }
  return (
    <div className={containerClassName}>
      <FieldShell label={label} htmlFor={inputId} hint={hint} error={error} required={required}>
        {control}
      </FieldShell>
    </div>
  );
});

export function Checkbox({
  label,
  description,
  error,
  id,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: string; error?: string }) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-start gap-2.5">
        <input
          id={inputId}
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line text-brand accent-brand focus:ring-brand-royal"
          aria-invalid={Boolean(error)}
          {...props}
        />
        <label htmlFor={inputId} className="text-sm leading-snug text-ink">
          {label}
          {description ? <span className="mt-0.5 block text-xs text-muted">{description}</span> : null}
        </label>
      </div>
      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
