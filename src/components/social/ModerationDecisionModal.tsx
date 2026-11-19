import { AlertTriangle, EyeOff, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MAX_MODERATION_REASON_LENGTH } from '../../services/moderation';
import type { ModerationReportItem } from '../../types';
import { Button } from '../ui/Button';

interface ModerationDecisionModalProps {
  open: boolean;
  action: 'hide' | 'restore';
  item: ModerationReportItem | null;
  isSubmitting: boolean;
  errorMessage: string | null;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

export function ModerationDecisionModal({
  open,
  action,
  item,
  isSubmitting,
  errorMessage,
  onConfirm,
  onClose,
}: ModerationDecisionModalProps) {
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setLocalError(null);
    const timer = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, item?.reportId, action]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, isSubmitting, onClose]);

  if (!open || !item) return null;

  const isHide = action === 'hide';
  const combinedError = localError || errorMessage;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setLocalError(
        isHide
          ? 'Informe uma justificativa para ocultar este relato.'
          : 'Informe uma justificativa para restaurar este relato.'
      );
      return;
    }

    if (trimmed.length > MAX_MODERATION_REASON_LENGTH) {
      setLocalError(
        `A justificativa deve ter no máximo ${MAX_MODERATION_REASON_LENGTH} caracteres.`
      );
      return;
    }

    setLocalError(null);
    await onConfirm(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="moderation-decision-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#E2E8F0] bg-white p-5 sm:p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                isHide
                  ? 'bg-[#FEE2E2] text-[#991B1B]'
                  : 'bg-sky-50 text-[#0284C7]'
              }`}
            >
              {isHide ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <h2
                id="moderation-decision-title"
                className="font-display text-base sm:text-lg font-bold text-[#0F172A]"
              >
                {isHide
                  ? 'Confirmar ocultação do relato?'
                  : 'Confirmar restauração do relato?'}
              </h2>
              <p className="mt-0.5 text-xs text-[#475569] break-words">
                Relato de {item.authorName} em {item.beachName}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            aria-label="Fechar confirmação"
            className="min-h-[44px] min-w-[44px] -mt-2 -mr-2 shrink-0 flex items-center justify-center rounded-xl text-[#475569] hover:bg-slate-100 hover:text-[#0F172A] disabled:opacity-50 transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
          <p className="text-xs sm:text-sm leading-relaxed text-[#475569]">
            {isHide
              ? 'O relato deixará de aparecer no feed, nas páginas de praias e nas consultas públicas, encerrando as denúncias pendentes. O autor continuará vendo um aviso no próprio perfil e poderá excluí-lo.'
              : 'O relato voltará a aparecer nas consultas públicas do app, preservando foto e marcações de "Foi útil" existentes sem duplicação.'}
          </p>

          {isHide && item.photoUrl && (
            <div
              role="note"
              className="rounded-xl border border-[#F59E0B]/40 bg-[#FEF3C7] px-3.5 py-2.5 text-xs leading-relaxed text-[#92400E]"
            >
              <strong>Atenção sobre a foto:</strong> ocultar remove o relato do app e da API pública, mas preserva o arquivo no bucket público <code>report-photos</code> e não revoga a URL direta da imagem.
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="moderation-reason-input"
                className="text-sm font-bold text-[#0F172A]"
              >
                Justificativa obrigatória
              </label>
              <span className="text-xs text-[#475569] tabular-nums">
                {reason.length}/{MAX_MODERATION_REASON_LENGTH}
              </span>
            </div>

            <textarea
              ref={textareaRef}
              id="moderation-reason-input"
              rows={3}
              maxLength={MAX_MODERATION_REASON_LENGTH}
              disabled={isSubmitting}
              required
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (localError) setLocalError(null);
              }}
              placeholder={
                isHide
                  ? 'Ex.: Conteúdo ofensivo / exposição de dados pessoais.'
                  : 'Ex.: Revisão manual concluiu que o relato cumpre as regras.'
              }
              className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-white p-3 text-sm text-[#0F172A] placeholder:text-[#475569]/70 focus:border-[#0284C7] focus:outline-none resize-none disabled:bg-slate-50"
            />
          </div>

          {combinedError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-[#EF4444]/30 bg-[#FEE2E2] px-3.5 py-2.5 text-xs sm:text-sm font-medium text-[#991B1B]"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span className="min-w-0 break-words">{combinedError}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant={isHide ? 'danger' : 'primary'}
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Salvando...'
                : isHide
                  ? 'Ocultar publicação'
                  : 'Restaurar publicação'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
