import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  title: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = 'Tentar novamente',
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-[#E2E8F0] bg-white px-5 py-8 text-center"
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FEE2E2] text-[#991B1B]">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="mt-3.5 font-display text-base sm:text-lg font-bold text-[#0F172A]">
        {title}
      </h2>
      <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-[#475569]">
        {description}
      </p>
      {onRetry && (
        <div className="mt-5">
          <Button onClick={onRetry}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
