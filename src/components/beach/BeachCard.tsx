import {
  ChevronRight,
  Clock,
  Droplets,
  HelpCircle,
  Thermometer,
  Waves,
  Wind,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Beach, BeachSnapshot } from '../../types';
import {
  getBeachDisplayCopy,
  getSnapshotAvailability,
  getValidSnapshotScore,
  isRioNighttime,
  type SnapshotAvailability,
} from '../../utils/beachRanking';
import { StatusBadge } from '../ui/StatusBadge';
import { WeatherIcon } from '../ui/WeatherIcon';

interface BeachCardProps {
  beach: Beach;
  snapshot: BeachSnapshot | null;
  availability?: SnapshotAvailability;
  validScore?: number | null;
  rank?: number | null;
  isTied?: boolean;
  isPartial?: boolean;
  isNight?: boolean;
}

export function BeachCard({
  beach,
  snapshot,
  availability: availabilityProp,
  validScore: validScoreProp,
  rank = null,
  isTied = false,
  isPartial: isPartialProp,
  isNight: isNightProp,
}: BeachCardProps) {
  const validScore =
    validScoreProp !== undefined ? validScoreProp : getValidSnapshotScore(snapshot);
  const availability =
    availabilityProp ?? getSnapshotAvailability(snapshot);
  const isStale = availability === 'stale';
  const isMissing = availability === 'missing' || !snapshot;
  const isPartial =
    isPartialProp ?? (availability !== 'missing' && snapshot?.sourceStatus === 'partial');
  const isNight = isNightProp ?? isRioNighttime();

  const displayCopy =
    !isMissing && snapshot ? getBeachDisplayCopy(snapshot, isNight) : null;

  return (
    <Link
      to={`/praia/${beach.slug}`}
      className="group block min-w-0 rounded-2xl border border-[#E2E8F0] bg-white p-4 sm:p-5 transition-colors hover:border-[#0284C7]/55 focus-visible:outline-2 focus-visible:outline-[#0284C7]"
    >
      {/* Linha 1: Posição no ranking + Ícone climático à esquerda | Status + Índice à direita */}
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {rank !== null && availability === 'current' && (
            <span
              aria-label={
                isTied ? `Posição ${rank}º (empate)` : `Posição ${rank}º`
              }
              className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs font-extrabold tabular-nums ${
                rank === 1
                  ? 'border-[#0284C7]/35 bg-sky-50 text-[#0284C7]'
                  : 'border-[#E2E8F0] bg-slate-50 text-[#334155]'
              }`}
            >
              {rank}º{isTied ? ' · Empate' : ''}
            </span>
          )}

          {isMissing || !snapshot ? (
            <HelpCircle
              className="h-5 w-5 shrink-0 text-slate-400"
              aria-hidden="true"
            />
          ) : (
            <WeatherIcon
              condition={snapshot.condition}
              isNight={isNight}
              className="h-5 w-5 shrink-0"
            />
          )}
        </div>

        <div className="ml-auto flex flex-col items-end gap-1 shrink-0">
          {isMissing || !snapshot ? (
            <span className="inline-flex items-center rounded-xl border border-[#E2E8F0] bg-slate-100 px-3 py-1.5 font-display text-xs font-bold text-[#475569] whitespace-nowrap">
              Sem dados
            </span>
          ) : (
            <>
              <StatusBadge status={snapshot.status} size="md" />
              <span className="text-xs font-bold text-[#334155] tabular-nums whitespace-nowrap">
                Índice {validScore}/100
              </span>
            </>
          )}
        </div>
      </div>

      {/* Linha 2: Nome completo da praia sem truncate + região e horário */}
      <div className="mt-2 min-w-0">
        <h2 className="font-display text-lg sm:text-xl font-extrabold leading-snug tracking-tight text-[#0F172A] break-words group-hover:text-[#0284C7] transition-colors">
          {beach.name}
        </h2>

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#475569]">
          <span>{beach.region}</span>
          <span aria-hidden="true">·</span>

          {isMissing || !snapshot ? (
            <span className="font-semibold text-[#64748B]">
              Sem leitura climática atual
            </span>
          ) : isStale ? (
            <span className="inline-flex flex-wrap items-center gap-1 font-semibold text-[#92400E] tabular-nums">
              <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>
                Última leitura (estimativa) às {snapshot.updatedAtLabel} · Dados desatualizados
              </span>
            </span>
          ) : (
            <span className="inline-flex flex-wrap items-center gap-1 tabular-nums">
              <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>Estimativa às {snapshot.updatedAtLabel}</span>
              {isPartial && (
                <span className="ml-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-[#475569]">
                  Dados parciais
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Resumo + até 2 motivos reais (sem afirmar segurança de banho/correntes) */}
      <div className="mt-3">
        <p className="text-sm font-medium text-[#0F172A]">
          {isMissing || !displayCopy
            ? 'Dados estimados de tempo e mar indisponíveis no momento.'
            : displayCopy.summaryReason}
        </p>

        {displayCopy && displayCopy.reasons.length > 0 && (
          <ul className="mt-2 space-y-1">
            {displayCopy.reasons.slice(0, 2).map((reason) => (
              <li
                key={reason}
                className="flex items-start gap-2 text-xs leading-snug text-[#475569]"
              >
                <span
                  className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#0284C7]"
                  aria-hidden="true"
                />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Métricas essenciais em linha única escaneável */}
      <div className="mt-3.5 flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
        <div className="grid flex-1 min-w-0 grid-cols-4 gap-1.5 sm:gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-1 text-[11px] font-medium text-[#475569]">
              <Thermometer className="h-3.5 w-3.5 shrink-0 text-[#0284C7]" aria-hidden="true" />
              Temp
            </span>
            <span className="text-[13px] sm:text-base font-bold text-[#0F172A] tabular-nums">
              {snapshot && snapshot.temperatureC !== null ? `${snapshot.temperatureC}°C` : '—'}
            </span>
          </div>

          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-1 text-[11px] font-medium text-[#475569]">
              <Droplets className="h-3.5 w-3.5 shrink-0 text-[#0284C7]" aria-hidden="true" />
              Chuva
            </span>
            <span className="text-[13px] sm:text-base font-bold text-[#0F172A] tabular-nums">
              {snapshot && snapshot.rainProb !== null ? `${snapshot.rainProb}%` : '—'}
            </span>
          </div>

          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-1 text-[11px] font-medium text-[#475569]">
              <Wind className="h-3.5 w-3.5 shrink-0 text-[#0284C7]" aria-hidden="true" />
              Vento
            </span>
            <span className="text-[13px] sm:text-base font-bold text-[#0F172A] tabular-nums">
              {snapshot && snapshot.windKmh !== null ? `${snapshot.windKmh} km/h` : '—'}
            </span>
          </div>

          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-1 text-[11px] font-medium text-[#475569]">
              <Waves className="h-3.5 w-3.5 shrink-0 text-[#0284C7]" aria-hidden="true" />
              Ondas
            </span>
            <span className="text-[13px] sm:text-base font-bold text-[#0F172A] tabular-nums">
              {snapshot && snapshot.waveHeightM !== null
                ? `${snapshot.waveHeightM.toFixed(1)} m`
                : '—'}
            </span>
          </div>
        </div>

        <ChevronRight
          className="h-4 w-4 shrink-0 text-[#475569] group-hover:translate-x-0.5 group-hover:text-[#0284C7] transition-transform mb-0.5"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}
