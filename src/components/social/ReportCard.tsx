import { MapPin, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BeachReport } from '../../types';
import { formatRelativeTime, getInitials } from '../../utils/formatters';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { StarRatingDisplay } from '../ui/StarRating';

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

  useEffect(() => {
    setAvatarError(false);
  }, [report.userAvatarUrl]);

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
        {/* Cabeçalho do relato: autor, praia, tempo e nota */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
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

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-bold text-[#0F172A]">
                  {report.userName}
                </p>
                {highlighted && <Badge tone="ocean">Publicado agora</Badge>}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[#475569]">
                {showBeachLink ? (
                  <Link
                    to={`/praia/${report.beachSlug}`}
                    className="inline-flex items-center gap-1 font-semibold text-[#0284C7] hover:underline"
                  >
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {report.beachName}
                  </Link>
                ) : (
                  <span className="font-semibold text-[#0F172A]">{report.beachName}</span>
                )}
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{formatRelativeTime(report.createdAt)}</span>
              </div>
            </div>
          </div>

          <StarRatingDisplay rating={report.rating} />
        </div>

        {/* Comentário do usuário */}
        {report.comment && (
          <p className="mt-3.5 text-sm sm:text-[15px] leading-relaxed text-[#0F172A]">
            {report.comment}
          </p>
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
    </Card>
  );
}
