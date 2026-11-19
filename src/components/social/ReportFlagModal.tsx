import { AlertTriangle, CheckCircle2, Flag, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  MAX_FLAG_DETAILS_LENGTH,
  REPORT_FLAG_REASONS,
  ReportFlagError,
  submitReportFlag,
} from '../../services/moderation';
import type { BeachReport, ReportFlagReason } from '../../types';
import { Button } from '../ui/Button';

interface ReportFlagModalProps {
  report: BeachReport | null;
  onClose: () => void;
  onFlagSuccess: (reportId: string) => void;
}

export function ReportFlagModal({
  report,
  onClose,
  onFlagSuccess,
}: ReportFlagModalProps) {
  const [selectedReason, setSelectedReason] = useState<ReportFlagReason | null>(
    null
  );
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!report) return;
    setSelectedReason(null);
    setDetails('');
    setIsSubmitting(false);
    setErrorMessage(null);
    setSubmitted(Boolean(report.viewerHasFlagged));

    const timer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [report?.id]);

  useEffect(() => {
    if (!report) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [report, isSubmitting, onClose]);

  if (!report) return null;

  const trimmedDetails = details.trim();
  const isOtherSelected = selectedReason === 'other';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting || submitted) return;

    setErrorMessage(null);

    if (!selectedReason) {
      setErrorMessage('Escolha o motivo da denúncia antes de enviar.');
      return;
    }

    if (trimmedDetails.length > MAX_FLAG_DETAILS_LENGTH) {
      setErrorMessage(
        `A observação deve ter no máximo ${MAX_FLAG_DETAILS_LENGTH} caracteres.`
      );
      return;
    }

    if (selectedReason === 'other' && trimmedDetails.length === 0) {
      setErrorMessage('Descreva o motivo no campo de observação.');
      return;
    }

    setIsSubmitting(true);

    try {
      await submitReportFlag({
        reportId: report.id,
        reason: selectedReason,
        details: trimmedDetails,
      });

      setSubmitted(true);
      onFlagSuccess(report.id);
    } catch (err) {
      if (err instanceof ReportFlagError && err.alreadyFlagged) {
        onFlagSuccess(report.id);
      }

      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Não foi possível enviar a denúncia agora. Tente novamente.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-flag-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#E2E8F0] bg-white p-5 sm:p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-[#92400E]">
              <Flag className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="report-flag-modal-title"
                className="font-display text-base sm:text-lg font-bold text-[#0F172A]"
              >
                Denunciar relato
              </h2>
              <p className="mt-0.5 text-xs text-[#475569] break-words">
                Publicação de {report.userName} em {report.beachName}
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            aria-label="Fechar janela de denúncia"
            className="min-h-[44px] min-w-[44px] -mt-2 -mr-2 shrink-0 flex items-center justify-center rounded-xl text-[#475569] hover:bg-slate-100 hover:text-[#0F172A] disabled:opacity-50 transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {submitted ? (
          <div className="mt-4 space-y-4">
            <div
              role="status"
              className="flex items-start gap-3 rounded-xl border border-[#10B981]/35 bg-[#DCFCE7] p-4 text-sm text-[#166534]"
            >
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1 min-w-0">
                <p className="font-bold">Denúncia registrada</p>
                <p className="text-xs leading-relaxed">
                  Recebemos sua denúncia para análise da moderação. Sua identidade não é exibida ao autor do relato nem ao público.
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={onClose}>
                Fechar
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
            <fieldset disabled={isSubmitting} className="space-y-2">
              <legend className="text-sm font-bold text-[#0F172A]">
                Qual é o problema neste relato?
              </legend>

              <div className="space-y-2 pt-1">
                {REPORT_FLAG_REASONS.map((option) => {
                  const checked = selectedReason === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                        checked
                          ? 'border-[#0284C7] bg-sky-50/70'
                          : 'border-[#E2E8F0] bg-white hover:border-[#0284C7]/45'
                      }`}
                    >
                      <input
                        type="radio"
                        name="report-flag-reason"
                        value={option.value}
                        checked={checked}
                        onChange={() => {
                          setSelectedReason(option.value);
                          setErrorMessage(null);
                        }}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#0284C7]"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[#0F172A]">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-xs text-[#475569]">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="flag-details-input"
                  className="text-sm font-bold text-[#0F172A]"
                >
                  {isOtherSelected
                    ? 'Observação (obrigatória para Outro)'
                    : 'Observação (opcional)'}
                </label>
                <span
                  className={`text-xs tabular-nums ${
                    details.length >= 450
                      ? 'font-semibold text-[#92400E]'
                      : 'text-[#475569]'
                  }`}
                >
                  {details.length}/{MAX_FLAG_DETAILS_LENGTH}
                </span>
              </div>

              <textarea
                id="flag-details-input"
                rows={3}
                maxLength={MAX_FLAG_DETAILS_LENGTH}
                disabled={isSubmitting}
                required={isOtherSelected}
                value={details}
                onChange={(e) => {
                  setDetails(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder={
                  isOtherSelected
                    ? 'Explique o que há de errado neste relato...'
                    : 'Adicione contexto para ajudar na análise, se quiser.'
                }
                className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-white p-3 text-sm text-[#0F172A] placeholder:text-[#475569]/70 focus:border-[#0284C7] focus:outline-none resize-none disabled:bg-slate-50"
              />
            </div>

            <p className="text-xs leading-relaxed text-[#475569]">
              A denúncia não apaga o conteúdo automaticamente. Um moderador analisará o relato; sua conta não será revelada ao autor.
            </p>

            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-[#EF4444]/30 bg-[#FEE2E2] px-3.5 py-2.5 text-xs sm:text-sm font-medium text-[#991B1B]"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span className="min-w-0 break-words">{errorMessage}</span>
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
                loading={isSubmitting}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Enviando...' : 'Enviar denúncia'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
