import {
  AlertTriangle,
  Check,
  ImageOff,
  Loader2,
  MapPin,
  Maximize2,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BeachReport } from '../../types';
import { formatRelativeTime, getInitials } from '../../utils/formatters';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { SunRatingDisplay } from '../ui/StarRating';
import { ReportPhotoViewerModal } from './ReportPhotoViewerModal';

interface ReportCardProps {
  report: BeachReport;
  showBeachLink?: boolean;
  highlighted?: boolean;
  currentUserId?: string | null;
  isHelpfulPending?: boolean;
  helpfulError?: string | null;
  onToggleHelpful?: (report: BeachReport) => void;
  onDismissHelpfulError?: (reportId: string) => void;
  onDeleteRequest?: (reportId: string) => void;
}

export function ReportCard({
  report,
  showBeachLink = true,
  highlighted = false,
  currentUserId = null,
  isHelpfulPending = false,
  helpfulError = null,
  onToggleHelpful,
  onDismissHelpfulError,
  onDeleteRequest,
}: ReportCardProps) {
  const [avatarError, setAvatarError] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
  const photoButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setAvatarError(false);
  }, [report.userAvatarUrl]);

  useEffect(() => {
    setPhotoError(false);
    setIsPhotoViewerOpen(false);
  }, [report.photoUrl]);

  const photoAlt =
    report.photoAlt ?? `Foto enviada no relato sobre ${report.beachName}`;

  const isOwnReport = Boolean(currentUserId && currentUserId === report.userId);
  const isReacted = Boolean(currentUserId && report.viewerHasReacted);
  const hasKnownHelpfulCount =
    typeof report.helpfulCount === 'number' && !report.helpfulLoadError;
  const helpfulCountLabel = hasKnownHelpfulCount ? String(report.helpfulCount) : '—';
  const helpfulCountAccessible = hasKnownHelpfulCount
    ? report.helpfulCount === 1
      ? '1 pessoa marcou como útil'
      : `${report.helpfulCount} pessoas marcaram como útil`
    : 'Contagem de utilidade indisponível no momento';

  const helpfulAriaLabel = !currentUserId
    ? `Entrar com Google para marcar o relato de ${report.userName} como "Foi útil". ${helpfulCountAccessible}.`
    : isReacted
      ? `Remover marcação "Foi útil" do relato de ${report.userName}. ${helpfulCountAccessible}.`
      : `Marcar relato de ${report.userName} como "Foi útil". ${helpfulCountAccessible}.`;

  return (
    <Card
      padding="md"
      className={`min-w-0 ${
        highlighted
          ? 'ring-2 ring-[#0284C7]/30 border-[#0284C7]'
          : ''
      }`}
    >
      <article className="min-w-0">
        {/* Cabeçalho do relato: no mobile coloca avaliação em sóis em linha própria; preserva desktop */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {report.userAvatarUrl && !avatarError ? (
              <img
                src={report.userAvatarUrl}
                alt={report.userName}
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
                className="h-10 w-10 shrink-0 rounded-full border border-sky-100 object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-xs font-bold text-[#0284C7] border border-sky-100">
                {getInitials(report.userName)}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="min-w-0 max-w-full break-words sm:truncate text-sm font-bold text-[#0F172A]">
                  {report.userName}
                </p>
                {highlighted && <Badge tone="ocean">Publicado agora</Badge>}
              </div>
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[#475569]">
                {showBeachLink ? (
                  <Link
                    to={`/praia/${report.beachSlug}`}
                    className="inline-flex min-w-0 max-w-full items-center gap-1 font-semibold text-[#0284C7] hover:underline break-words"
                  >
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">{report.beachName}</span>
                  </Link>
                ) : (
                  <span className="min-w-0 max-w-full font-semibold text-[#0F172A] break-words">
                    {report.beachName}
                  </span>
                )}
                <span aria-hidden="true">·</span>
                <span className="tabular-nums whitespace-nowrap">
                  {formatRelativeTime(report.createdAt)}
                </span>
              </div>
            </div>
          </div>

          <div className="pl-[52px] sm:pl-0 sm:pt-0.5 shrink-0">
            <SunRatingDisplay rating={report.rating} />
          </div>
        </div>

        {/* Comentário do usuário */}
        {report.comment && (
          <p className="mt-3.5 break-words text-sm sm:text-[15px] leading-relaxed text-[#0F172A]">
            {report.comment}
          </p>
        )}

        {/* Foto opcional do relato: miniatura 4:3 centralizada; modal exibe foto completa sem cortes */}
        {report.photoUrl && (
          <div className="mt-3.5">
            {photoError ? (
              <div className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-slate-50 px-3.5 py-2.5 text-xs text-[#475569]">
                <ImageOff className="h-4 w-4 shrink-0 text-[#64748B]" aria-hidden="true" />
                <span>Foto indisponível no momento.</span>
              </div>
            ) : (
              <button
                ref={photoButtonRef}
                type="button"
                onClick={() => setIsPhotoViewerOpen(true)}
                aria-label={`Ampliar foto do relato de ${report.userName} em ${report.beachName}`}
                className="group relative block aspect-[4/3] w-full overflow-hidden rounded-xl border border-[#E2E8F0] bg-slate-100 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7]"
              >
                <img
                  src={report.photoUrl}
                  alt={photoAlt}
                  loading="lazy"
                  onError={() => setPhotoError(true)}
                  className="h-full w-full object-cover object-center transition-transform duration-200 group-hover:scale-[1.01]"
                />
                <span
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-slate-950/45 to-transparent"
                  aria-hidden="true"
                />
                <span className="pointer-events-none absolute right-2.5 bottom-2.5 inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-slate-950/80 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm backdrop-blur-xs">
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Ampliar
                </span>
              </button>
            )}
          </div>
        )}

        {/* Rodapé do cartão: reação "Foi útil" (ou total no próprio relato) + Excluir (somente autor) */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
          {isOwnReport ? (
            <div
              aria-label={`Seu relato: ${helpfulCountAccessible}.`}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-slate-50 px-3 text-xs font-medium text-[#475569]"
            >
              <ThumbsUp className="h-3.5 w-3.5 text-[#64748B]" aria-hidden="true" />
              <span>Foi útil</span>
              <span
                className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-bold text-[#0F172A] tabular-nums border border-slate-200/80"
                aria-hidden="true"
              >
                {helpfulCountLabel}
              </span>
            </div>
          ) : (
            <button
              type="button"
              disabled={isHelpfulPending || !onToggleHelpful}
              aria-pressed={isReacted}
              aria-label={helpfulAriaLabel}
              onClick={() => onToggleHelpful?.(report)}
              className={`min-h-[44px] inline-flex items-center gap-1.5 rounded-xl px-3.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-[#0284C7] disabled:opacity-65 ${
                isReacted
                  ? 'border-2 border-[#0284C7] bg-sky-50 font-bold text-[#0284C7]'
                  : 'border border-[#E2E8F0] bg-white font-semibold text-[#475569] hover:border-[#0284C7]/50 hover:text-[#0F172A]'
              }`}
            >
              {isHelpfulPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0284C7]" aria-hidden="true" />
              ) : (
                <ThumbsUp
                  className={`h-3.5 w-3.5 ${isReacted ? 'fill-current' : ''}`}
                  aria-hidden="true"
                />
              )}
              <span>Foi útil</span>
              {isReacted && !isHelpfulPending && (
                <Check className="h-3 w-3 stroke-[2.75]" aria-hidden="true" />
              )}
              <span
                className={`ml-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                  isReacted
                    ? 'bg-[#0284C7] text-white'
                    : 'bg-slate-100 text-[#0F172A]'
                }`}
                aria-hidden="true"
              >
                {helpfulCountLabel}
              </span>
            </button>
          )}

          {onDeleteRequest && (
            <button
              type="button"
              onClick={() => onDeleteRequest(report.id)}
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-[#991B1B] hover:bg-[#FEE2E2]/60 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Excluir
            </button>
          )}
        </div>

        {helpfulError && (
          <div
            role="alert"
            className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-[#EF4444]/30 bg-[#FEE2E2] px-3 py-2 text-xs font-medium text-[#991B1B]"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{helpfulError}</span>
            </div>
            {onDismissHelpfulError && (
              <button
                type="button"
                onClick={() => onDismissHelpfulError(report.id)}
                className="shrink-0 font-bold underline"
              >
                Fechar
              </button>
            )}
          </div>
        )}
      </article>

      {report.photoUrl && (
        <ReportPhotoViewerModal
          open={isPhotoViewerOpen}
          photoUrl={report.photoUrl}
          alt={photoAlt}
          authorName={report.userName}
          beachName={report.beachName}
          returnFocusRef={photoButtonRef}
          onClose={() => setIsPhotoViewerOpen(false)}
        />
      )}
    </Card>
  );
}
