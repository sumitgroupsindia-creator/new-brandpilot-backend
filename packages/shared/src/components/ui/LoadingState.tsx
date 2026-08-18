import { Skeleton } from './Skeleton';

interface LoadingStateProps {
  lines?: number;
}

export function LoadingState({ lines = 3 }: LoadingStateProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}
