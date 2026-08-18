import { ReactNode } from 'react';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function SectionHeader({ title, subtitle, actions }: SectionHeaderProps) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3 dashboard-section-header">
      <div>
        <h2 className="text-xl font-semibold text-[var(--color-ink)]">{title}</h2>
        {subtitle ? <p className="text-[15px] leading-6 text-[var(--color-ink-muted)]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
