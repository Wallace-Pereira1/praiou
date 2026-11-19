import { ImageOff, MapPin, Maximize2, Trash2 } from 'lucide-react';
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
  onDeleteRequest?: (reportId: string) => void;
}

export function ReportCard({
  report,
  showBeachLink = true,
  highlighted = false,
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

  return (
    <Card
      padding="md"
      className={
        highlighted
          ? 'ring-2 ring-[#0284C7]/30 border-[#0284C7]'
          : ''
      }
    >
      <article>
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
              <div className="flex flex-wrap items-center gap-2">
                <p className="break-words sm:truncate text-sm font-bold text-[#0F172A]">
                  {report.userName}
                </p>
                {highlighted && <Badge tone="ocean">Publicado agora</Badge>}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[#475569]">
                {showBeachLink ? (
                  <Link
                    to={`/praia/${report.beachSlug}`}
                    className="inline-flex items-center gap-1 font-semibold text-[#0284C7] hover:underline break-words"
                  >
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>{report.beachName}</span>
                  </Link>
                ) : (
                  <span className="font-semibold text-[#0F172A] break-words">
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

        {/* Exclusão disponível apenas para o autor (passada pela tela pai) */}
        {onDeleteRequest && (
          <div className="mt-2.5 flex items-center justify-end gap-1 border-t border-slate-100 pt-1.5">
            <button
              type="button"
              onClick={() => onDeleteRequest(report.id)}
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-[#991B1B] hover:bg-[#FEE2E2]/60 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Excluir
            </button>
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
