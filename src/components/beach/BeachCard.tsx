import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Droplets,
  HelpCircle,
  Info,
  ShieldAlert,
  Thermometer,
  Waves,
  Wind,
} from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Beach, BeachSnapshot } from '../../types';
import {
  formatBeachScore,
  getSnapshotAvailability,
  getValidSnapshotScore,
  isRioNighttime,
  type SnapshotAvailability,
} from '../../utils/beachRanking';
import {
  buildBeachScoreExplanation,
  type FactorRating,
} from '../../utils/beachScoreExplanation';
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

const RATING_BADGE_CLASSES: Record<FactorRating, string> = {
  bom: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  regular: 'border-amber-200 bg-amber-50 text-amber-800',
  atencao: 'border-rose-200 bg-rose-50 text-rose-800',
  indisponivel: 'border-slate-200 bg-slate-100 text-slate-600',
};

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
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const toggleId = useId();
  const panelId = useId();

  const validScore =
    validScoreProp !== undefined ? validScoreProp : getValidSnapshotScore(snapshot);
  const availability =
    availabilityProp ?? getSnapshotAvailability(snapshot);
  const isStale = availability === 'stale';
  const isMissing = availability === 'missing' || !snapshot;
  const isPartial =
    isPartialProp ?? (availability !== 'missing' && snapshot?.sourceStatus === 'partial');
  const isNight = isNightProp ?? isRioNighttime();

  const scoreExplanation =
    !isMissing && snapshot ? buildBeachScoreExplanation(snapshot, isNight) : null;

  return (
    <article className="min-w-0 rounded-2xl border border-[#E2E8F0] bg-white p-4 sm:p-5 transition-colors hover:border-[#0284C7]/55">
      <Link
        to={`/praia/${beach.slug}`}
        className="group block min-w-0 rounded-xl focus-visible:outline-2 focus-visible:outline-[#0284C7]"
      >
        {/* Linha 1: Posição no ranking + Ícone climático à esquerda | Status + Índice à direita */}
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {rank !== null && rank >= 1 && rank <= 3 && availability === 'current' && (
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
                  Índice {formatBeachScore(validScore)}
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
                  Última previsão às {snapshot.updatedAtLabel} · Dados desatualizados
                </span>
              </span>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-1 tabular-nums">
                <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>Previsão estimada às {snapshot.updatedAtLabel}</span>
                {isPartial && (
                  <span className="ml-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-[#475569]">
                    Dados parciais
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Explicação curta baseada nos fatores reais desta praia */}
        <div className="mt-3">
          <p className="text-sm font-medium leading-snug text-[#0F172A]">
            {isMissing || !scoreExplanation
              ? 'Dados estimados de tempo e mar indisponíveis no momento.'
              : scoreExplanation.shortSummary}
          </p>
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

      {/* Detalhe expansível "Por que Praiou?" fora do Link para acessibilidade e interação independente */}
      {!isMissing && snapshot && scoreExplanation && (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <button
            type="button"
            id={toggleId}
            aria-expanded={isDetailsOpen}
            aria-controls={panelId}
            onClick={() => setIsDetailsOpen((prev) => !prev)}
            className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold text-[#0284C7] transition-colors hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-[#0284C7]"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Por que Praiou?</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[#475569]">
              <span>{isDetailsOpen ? 'Ocultar' : 'Ver fatores'}</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  isDetailsOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </span>
          </button>

          {isDetailsOpen && (
            <div
              id={panelId}
              role="region"
              aria-labelledby={toggleId}
              className="mt-2 space-y-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs text-[#334155]"
            >
              {/* Horário e natureza estimada */}
              <div className="space-y-1">
                <p className="font-semibold text-[#0F172A]">
                  Como este índice foi estimado ({formatBeachScore(validScore)})
                </p>
                <p className="text-[11px] leading-relaxed text-[#475569]">
                  {isStale
                    ? `Última leitura às ${snapshot.updatedAtLabel} (desatualizada). Os valores vêm de previsões numéricas e podem ter mudado.`
                    : `Estimativa das ${snapshot.updatedAtLabel} calculada a partir de previsões numéricas de tempo e mar. Não é garantia nem medição em tempo real na areia.`}
                </p>
                {scoreExplanation.hasRedistributedWeights && (
                  <p className="text-[11px] leading-relaxed text-[#475569]">
                    Leitura parcial: os pesos foram redistribuídos proporcionalmente entre os fatores com dados disponíveis.
                  </p>
                )}
              </div>

              {scoreExplanation.capNotice && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 p-2.5 text-[11px] font-medium leading-relaxed text-[#92400E]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{scoreExplanation.capNotice}</span>
                </div>
              )}

              {/* Fatores reais usados no cálculo */}
              <ul className="space-y-2" aria-label="Fatores considerados no índice">
                {scoreExplanation.factors.map((factor) => (
                  <li
                    key={factor.key}
                    className="rounded-lg border border-[#E2E8F0] bg-white p-2.5 space-y-1"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex flex-wrap items-baseline gap-1.5 min-w-0">
                        <span className="font-bold text-[#0F172A]">
                          {factor.label}
                        </span>
                        <span className="text-[11px] text-[#475569] tabular-nums">
                          {scoreExplanation.hasRedistributedWeights &&
                          factor.effectiveWeightPercent > 0 &&
                          factor.effectiveWeightPercent !== factor.nominalWeightPercent
                            ? `Peso ajustado ~${factor.effectiveWeightPercent}% (base ${factor.nominalWeightPercent}%)`
                            : `Peso ${factor.nominalWeightPercent}%`}
                        </span>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${RATING_BADGE_CLASSES[factor.rating]}`}
                      >
                        {factor.ratingLabel}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11px] text-[#475569] tabular-nums">
                      <span>
                        Previsto:{' '}
                        <strong className="font-semibold text-[#0F172A]">
                          {factor.predictedValueLabel}
                        </strong>
                      </span>
                      {factor.contributedPointsApprox !== null && (
                        <span>
                          Aprox. {factor.contributedPointsApprox.toFixed(1)} de{' '}
                          {factor.maxPointsApprox.toFixed(0)} pts
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] leading-relaxed text-[#475569]">
                      {factor.effectDescription}
                    </p>
                  </li>
                ))}
              </ul>

              {/* Fontes de dados */}
              <div className="rounded-lg border border-[#E2E8F0] bg-white p-2.5 space-y-1 text-[11px] leading-relaxed text-[#475569]">
                <p className="font-semibold text-[#0F172A]">Fontes das previsões</p>
                <p>
                  <strong className="font-medium text-[#334155]">Clima:</strong>{' '}
                  {scoreExplanation.weatherSourceLabel}
                </p>
                <p>
                  <strong className="font-medium text-[#334155]">Mar e ondas:</strong>{' '}
                  {scoreExplanation.marineSourceLabel}
                </p>
              </div>

              {/* Segurança e limites */}
              <div className="flex items-start gap-2 rounded-lg border border-[#F59E0B]/40 bg-[#FEF3C7]/70 p-2.5 text-[11px] leading-relaxed text-[#78350F]">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#92400E]" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="font-semibold text-[#78350F]">
                    Estimativa informativa — não indica balneabilidade nem segurança para banho.
                  </p>
                  <p>
                    O índice não mede poluição da água, correnteza, valas, água-viva, lotação, presença de salvamento ou condições locais em tempo real. Observe as bandeiras na orla e siga sempre a orientação dos guarda-vidas.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
