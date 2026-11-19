import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[#0284C7] text-white hover:bg-sky-700 active:bg-sky-800 border border-transparent',
  secondary:
    'bg-white text-[#0F172A] border border-[#E2E8F0] hover:border-[#0284C7]/45 hover:bg-slate-50',
  ghost:
    'bg-transparent text-[#475569] border border-transparent hover:bg-slate-100 hover:text-[#0F172A]',
  danger:
    'bg-[#EF4444] text-white hover:bg-red-600 active:bg-red-700 border border-transparent',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'min-h-[44px] px-4 py-2 text-sm rounded-xl',
  lg: 'min-h-[48px] px-5 py-3 text-sm rounded-xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0284C7] disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99] ${
        VARIANT_CLASSES[variant]
      } ${SIZE_CLASSES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
}
