import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';

interface CategoryCardProps {
  name: string;
  imageUrl?: string | null;
  countLabel?: string;
  selected?: boolean;
  onClick?: () => void;
}

export function CategoryCard({ name, imageUrl, countLabel, selected = false, onClick }: CategoryCardProps) {
  return (
    <button type="button" className="w-full text-left" onClick={onClick}>
      <Card variant={selected ? 'selected' : 'interactive'} className="overflow-hidden">
        <div className="h-28 w-full bg-[var(--color-surface-2)]">
          {imageUrl ? <img src={imageUrl} alt={name} className="h-full w-full object-cover" loading="lazy" /> : null}
        </div>
        <div className="p-3">
          <p className="text-sm font-semibold text-[var(--color-ink)]">{name}</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-[var(--color-ink-muted)]">Browse templates</span>
            {countLabel ? <Badge variant="default">{countLabel}</Badge> : null}
          </div>
        </div>
      </Card>
    </button>
  );
}
