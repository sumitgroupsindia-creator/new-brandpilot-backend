import { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'ai';

const variants: Record<BadgeVariant, string> = {
  default: 'bg-[var(--color-surface-2)] text-[var(--color-ink-muted)] border border-[var(--color-border)]',
  success: 'bg-[var(--color-success-50)] text-[var(--color-success-700)] border border-[var(--color-success-200)]',
  warning: 'bg-[var(--color-warning-50)] text-[var(--color-warning-700)] border border-[var(--color-warning-200)]',
  error: 'bg-[var(--color-danger-50)] text-[var(--color-danger-700)] border border-[var(--color-danger-200)]',
  ai: 'bg-[var(--color-ai-50)] text-[var(--color-ai-700)] border border-[var(--color-ai-200)]',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = 'default', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em]', variants[variant], className)}
      {...props}
    />
  );
}
