import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { PraiouStatus } from '../../types';
import { getStatusMeta } from '../../utils/formatters';

interface StatusBadgeProps {
  status: PraiouStatus;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const meta = getStatusMeta(status);
  const Icon =
    status === 'praiou'
      ? CheckCircle2
      : status === 'talvez'
        ? AlertTriangle
        : XCircle;

  if (size === 'lg') {
    return (
      <span
        className={`inline-flex items-center gap-2.5 rounded-2xl border px-4 py-2.5 font-display text-lg sm:text-xl font-extrabold tracking-tight whitespace-nowrap shrink-0 ${meta.bgClass} ${meta.textClass} ${meta.borderClass}`}
      >
        <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
        {meta.label}
      </span>
    );
  }

  if (size === 'md') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-display text-sm font-extrabold tracking-tight whitespace-nowrap shrink-0 ${meta.bgClass} ${meta.textClass} ${meta.borderClass}`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {meta.label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold tracking-tight whitespace-nowrap shrink-0 ${meta.bgClass} ${meta.textClass}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {meta.label}
    </span>
  );
}
