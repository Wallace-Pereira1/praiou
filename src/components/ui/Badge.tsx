import type { ReactNode } from 'react';

type BadgeTone = 'neutral' | 'ocean' | 'success' | 'warning' | 'danger';

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-[#475569]',
  ocean: 'bg-sky-50 text-[#0284C7]',
  success: 'bg-[#DCFCE7] text-[#166534]',
  warning: 'bg-[#FEF3C7] text-[#92400E]',
  danger: 'bg-[#FEE2E2] text-[#991B1B]',
};

export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold tracking-tight whitespace-nowrap shrink-0 ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
