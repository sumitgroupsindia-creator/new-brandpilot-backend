import { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type CardVariant = 'default' | 'interactive' | 'selected' | 'elevated';

const variantClasses: Record<CardVariant, string> = {
  default: 'border border-[var(--color-border)] bg-[var(--color-surface-1)]',
  interactive: 'border border-[var(--color-border)] bg-[var(--color-surface-1)] hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-sm)]',
  selected: 'border border-[var(--color-brand-300)] bg-[var(--color-brand-50)] shadow-[var(--shadow-sm)]',
  elevated: 'border border-[var(--color-border)] bg-[var(--color-surface-1)] shadow-[var(--shadow-md)]',
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

export function Card({ variant = 'default', className, ...props }: CardProps) {
  return (
    <div className={cn('rounded-[var(--radius-lg)] transition-all duration-200', variantClasses[variant], className)} {...props} />
  );
}
