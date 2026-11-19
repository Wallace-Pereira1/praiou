import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';

export function BeachCardSkeleton() {
  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-3.5 w-44" />
        </div>
        <Skeleton className="h-9 w-28 rounded-xl" />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 border-y border-slate-100 py-3">
        {[1, 2, 3, 4].map((col) => (
          <div key={col} className="space-y-1.5">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-5 w-12" />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-4 w-4" />
      </div>
    </Card>
  );
}
