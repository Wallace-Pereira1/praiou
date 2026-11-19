import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  dashed?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  dashed = false,
}: EmptyStateProps) {
  return (
    <div
      className={`rounded-2xl border ${
        dashed ? 'border-dashed border-slate-300' : 'border-[#E2E8F0]'
      } bg-white px-5 py-8 text-center`}
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-[#0284C7]">
        {icon}
      </div>
      <h2 className="mt-3.5 font-display text-base sm:text-lg font-bold text-[#0F172A]">
        {title}
      </h2>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-[#475569]">
        {description}
      </p>
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
