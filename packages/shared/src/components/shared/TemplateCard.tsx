import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface TemplateCardProps {
  title: string;
  category: string;
  description?: string;
  thumbnailUrl?: string | null;
  tier?: 'FREE' | 'PREMIUM';
  credits?: number;
  isLocked?: boolean;
  onPreview?: () => void;
  onUse?: () => void;
}

export function TemplateCard({
  title,
  category,
  description,
  thumbnailUrl,
  tier = 'FREE',
  credits,
  isLocked,
  onPreview,
  onUse,
}: TemplateCardProps) {
  return (
    <Card variant="interactive" className="overflow-hidden">
      <div className="h-40 bg-[var(--color-surface-2)]">
        {thumbnailUrl ? <img src={thumbnailUrl} alt={title} className="h-full w-full object-cover" loading="lazy" /> : null}
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-[0.1em] text-[var(--color-ink-subtle)]">{category}</p>
          <Badge variant={tier === 'PREMIUM' ? 'warning' : 'success'}>{tier}</Badge>
        </div>
        <h3 className="text-base font-semibold text-[var(--color-ink)]">{title}</h3>
        {description ? <p className="text-sm text-[var(--color-ink-muted)]">{description}</p> : null}

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-sm font-semibold text-[var(--color-ink)]">{credits ?? 0} credits</span>
          {isLocked ? <Badge variant="warning">Subscription</Badge> : null}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onPreview}>
            Preview
          </Button>
          <Button variant="primary" size="sm" onClick={onUse} disabled={isLocked}>
            Use template
          </Button>
        </div>
      </div>
    </Card>
  );
}
