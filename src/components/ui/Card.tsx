import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
}

const PADDING_CLASSES = {
  none: '',
  sm: 'p-3.5',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
};

export function Card({
  children,
  padding = 'md',
  interactive = false,
  className = '',
  ...props
}: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-[#E2E8F0] bg-white ${PADDING_CLASSES[padding]} ${
        interactive
          ? 'transition-colors hover:border-[#0284C7]/50 focus-within:border-[#0284C7]'
          : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
