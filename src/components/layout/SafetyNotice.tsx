import { ShieldAlert, X } from 'lucide-react';

interface SafetyNoticeProps {
  dismissible?: boolean;
  onDismiss?: () => void;
  variant?: 'compact' | 'prominent';
}

export function SafetyNotice({
  dismissible = false,
  onDismiss,
  variant = 'compact',
}: SafetyNoticeProps) {
  if (variant === 'prominent') {
    return (
      <section
        aria-label="Orientação de segurança no mar"
        className="rounded-2xl border border-[#E2E8F0] bg-white p-4 sm:p-5"
      >
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-[#92400E]">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-sm font-bold text-[#0F172A]">
              Aproveite o mar com atenção
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-[#475569]">
              O Praiou? é um guia rápido de clima e mar. Antes de entrar na água,
              confira a bandeira do posto, observe as correntes e siga sempre a
              orientação dos guarda-vidas.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div
      role="note"
      className="flex items-center justify-between gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-xs text-[#475569]"
    >
      <div className="flex items-center gap-2 min-w-0">
        <ShieldAlert className="h-4 w-4 shrink-0 text-[#92400E]" aria-hidden="true" />
        <p className="leading-snug">
          Guia informativo: observe as bandeiras e siga a orientação dos guarda-vidas.
        </p>
      </div>
      {dismissible && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dispensar aviso de segurança"
          className="min-h-[44px] min-w-[44px] -my-2 -mr-2 flex items-center justify-center rounded-lg text-[#475569] hover:bg-slate-100 hover:text-[#0F172A] transition-colors shrink-0"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
