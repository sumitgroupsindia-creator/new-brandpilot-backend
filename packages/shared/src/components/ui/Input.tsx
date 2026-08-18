import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, hasError = false, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-[var(--radius-md)] border bg-[var(--color-surface-1)] px-3 text-sm text-[var(--color-ink)] shadow-[var(--shadow-xs)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)]',
        hasError ? 'border-[var(--color-danger-400)]' : 'border-[var(--color-border)]',
        className,
      )}
      {...props}
    />
  );
});
