import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({ title = 'Something went wrong', description = 'Please try again in a moment.', onRetry }: ErrorStateProps) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-danger-200)] bg-[var(--color-danger-50)] p-4">
      <p className="font-semibold text-[var(--color-danger-700)]">{title}</p>
      <p className="mt-1 text-sm text-[var(--color-danger-700)]">{description}</p>
      {onRetry ? (
        <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
