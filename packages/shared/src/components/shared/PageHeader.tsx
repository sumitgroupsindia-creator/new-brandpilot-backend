import { PropsWithChildren, ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface PageHeaderProps extends PropsWithChildren {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, className, children }: PageHeaderProps) {
  return (
    <header className={cn('rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-1)] p-5 shadow-[var(--shadow-xs)] dashboard-page-header', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-subtle)]">{eyebrow}</p> : null}
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-[2.15rem]">{title}</h1>
          {description ? <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[var(--color-ink-muted)]">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
