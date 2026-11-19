import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Clock,
  Cloud,
  Compass,
  Droplets,
  MessageSquarePlus,
  Plus,
  Share2,
  Sun,
  Thermometer,
  Waves,
  Wind,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SafetyNotice } from '../components/layout/SafetyNotice';
import { ReportCard } from '../components/social/ReportCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { StatusBadge } from '../components/ui/StatusBadge';
import { WeatherIcon } from '../components/ui/WeatherIcon';
import { useApp } from '../context/AppContext';
import { useReportHelpfulActions } from '../hooks/useReportHelpfulActions';
import * as reportsService from '../services/reports';
import type { BeachReport } from '../types';
import { isRioNighttime } from '../utils/beachRanking';
import { formatCompassDirection } from '../utils/formatters';

export function BeachDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    beaches,
    getSnapshotByBeachId,
    user,
    authReady,
    isInitialLoading,
    loadError,
    refreshData,
  } = useApp();

  const devState = import.meta.env.DEV ? searchParams.get('estado') : null;

  const [isRetrying, setIsRetrying] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);

  const [beachReports, setBeachReports] = useState<BeachReport[]>([]);
  const [beachReportsTotal, setBeachReportsTotal] = useState(0);
  const [reportsPage, setReportsPage] = useState(1);
  const [reportsHasMore, setReportsHasMore] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsLoadingMore, setReportsLoadingMore] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reportPendingDelete, setReportPendingDelete] = useState<string | null>(null);
  const loadRequestIdRef = useRef(0);
  const deleteEpochRef = useRef(0);
  const deletedReportIdsRef = useRef<Set<string>>(new Set());

  const beach = beaches.find((b) => b.slug === slug);
  const snapshot = beach ? getSnapshotByBeachId(beach.id) : undefined;

  const isLoading = isInitialLoading || isRetrying || devState === 'loading';
  const hasError =
    (!isLoading && Boolean(loadError)) || (!isRetrying && devState === 'erro');
  const isStale = devState === 'desatualizado' || snapshot?.sourceStatus === 'stale';

  const loadBeachReports = useCallback(
    async (targetBeachId: string, targetPage: number, append: boolean) => {
      const requestId = ++loadRequestIdRef.current;
      const startDeleteEpoch = deleteEpochRef.current;

      if (append) {
        setReportsLoadingMore(true);
      } else {
        setReportsLoading(true);
      }
      setReportsError(null);

      try {
        const result = await reportsService.getReportsByBeach(targetBeachId, {
          page: targetPage,
          pageSize: reportsService.DEFAULT_REPORTS_PAGE_SIZE,
        });

        if (requestId !== loadRequestIdRef.current) {
          return;
        }

        const filteredItems = result.items.filter(
          (r) => !deletedReportIdsRef.current.has(r.id)
        );
        const deletedDuringFetch = startDeleteEpoch !== deleteEpochRef.current;

        setReportsPage(result.page);
        if (!deletedDuringFetch) {
          setBeachReportsTotal(result.totalCount);
        }
        setReportsHasMore(result.hasMore);

        if (append) {
          setBeachReports((prev) => {
            const seen = new Set(prev.map((r) => r.id));
            const next = filteredItems.filter((r) => !seen.has(r.id));
            return [...prev, ...next];
          });
        } else {
          setBeachReports(filteredItems);
        }
      } catch (err) {
        if (requestId !== loadRequestIdRef.current) {
          return;
        }
        if (!append) {
          setBeachReports([]);
          setBeachReportsTotal(0);
          setReportsHasMore(false);
        }
        setReportsError(
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar os relatos desta praia.'
        );
      } finally {
        if (requestId === loadRequestIdRef.current) {
          setReportsLoading(false);
          setReportsLoadingMore(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!authReady) return;
    if (!beach?.id || devState === 'vazio') {
      loadRequestIdRef.current += 1;
      setBeachReports([]);
      setBeachReportsTotal(0);
      setReportsHasMore(false);
      setReportsError(null);
      return;
    }

    void loadBeachReports(beach.id, 1, false);
  }, [authReady, beach?.id, devState, loadBeachReports]);

  const helpfulActions = useReportHelpfulActions({
    userId: user?.id ?? null,
    authReady,
    items: beachReports,
    setItems: setBeachReports,
    returnTo: `${location.pathname}${location.search}`,
  });

  const handleRetry = async () => {
    if (devState) {
      setSearchParams({}, { replace: true });
    }
    setIsRetrying(true);
    try {
      await refreshData(true);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // Fallback silencioso
    }
    setCopiedNotice(true);
    window.setTimeout(() => setCopiedNotice(false), 2200);
  };

  const handleConfirmDelete = async () => {
    if (!reportPendingDelete) return;
    const targetId = reportPendingDelete;
    setReportPendingDelete(null);
    setDeleteError(null);

    try {
      await reportsService.deleteReport(targetId);
      deletedReportIdsRef.current.add(targetId);
      deleteEpochRef.current += 1;
      setBeachReports((prev) => prev.filter((r) => r.id !== targetId));
      setBeachReportsTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : 'Não foi possível excluir o relato agora.'
      );
    }
  };

  if (!isLoading && !hasError && (!beach || !snapshot)) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] px-4 py-12">
        <div className="mx-auto max-w-md">
          <EmptyState
            icon={<Waves className="h-6 w-6" aria-hidden="true" />}
            title="Praia não encontrada"
            description="Não encontramos essa praia na lista atual do Rio de Janeiro."
            action={
              <Link
                to="/"
                className="min-h-[44px] inline-flex items-center justify-center rounded-xl bg-[#0284C7] px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 transition-colors"
              >
                Voltar para as praias
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] pb-14">
      {/* Barra superior limpa */}
      <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl px-2.5 -ml-2 text-sm font-semibold text-[#0F172A] hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar
          </button>

          <span className="truncate font-display text-base font-bold text-[#0F172A]">
            {beach?.name ?? 'Praia'}
          </span>

          <button
            type="button"
            onClick={handleShare}
            aria-label="Compartilhar condições da praia"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-[#475569] hover:bg-slate-100 hover:text-[#0F172A] transition-colors shrink-0"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">
              {copiedNotice ? 'Copiado!' : 'Compartilhar'}
            </span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-5 sm:px-6 space-y-5">
        {copiedNotice && (
          <div
            role="status"
            className="sm:hidden rounded-xl border border-[#0284C7]/30 bg-sky-50 px-3.5 py-2 text-xs font-semibold text-[#0284C7] text-center"
          >
            Link copiado para compartilhar.
          </div>
        )}

        {/* Estado: Loading */}
        {isLoading && (
          <div className="space-y-4" aria-busy="true">
            <Card padding="lg">
              <div className="space-y-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-8 w-52" />
                <Skeleton className="h-12 w-40 rounded-2xl" />
                <div className="space-y-2 pt-3 border-t border-slate-100">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              </div>
            </Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card padding="md">
                <Skeleton className="h-32 w-full" />
              </Card>
              <Card padding="md">
                <Skeleton className="h-32 w-full" />
              </Card>
            </div>
          </div>
        )}

        {/* Estado: Erro */}
        {!isLoading && hasError && (
          <ErrorState
            title={`Erro ao carregar os dados${beach ? ` de ${beach.name}` : ''}`}
            description="Não conseguimos atualizar as previsões desta praia agora. Tente novamente em instantes."
            onRetry={handleRetry}
          />
        )}

        {/* Conteúdo completo */}
        {!isLoading && !hasError && beach && snapshot && (
          <>
            {/* Banner de dados desatualizados */}
            {isStale && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-xl border border-[#F59E0B]/40 bg-[#FEF3C7] px-4 py-3 text-sm text-[#92400E]"
              >
                <Clock className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <p className="leading-snug">
                  <span className="font-bold">
                    Última leitura às {snapshot.updatedAtLabel}.
                  </span>{' '}
                  Exibindo os dados mais recentes disponíveis enquanto aguardamos a próxima
                  atualização.
                </p>
              </div>
            )}

            {/* Hero Veredito Praiou? com forte destaque */}
            <Card padding="lg">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-medium text-[#475569]">
                    {beach.region} · {beach.neighborhoodNote}
                  </p>
                  <h1 className="mt-1 font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F172A]">
                    {beach.name}
                  </h1>
                </div>

                <div className="flex flex-col items-start sm:items-end gap-1.5">
                  <StatusBadge status={snapshot.status} size="lg" />
                  <div className="flex items-center gap-2 text-xs text-[#475569] tabular-nums">
                    <span className="font-semibold text-[#0F172A]">
                      {snapshot.score !== null ? `Índice ${snapshot.score}/100` : 'Índice —'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      {isStale
                        ? `Última leitura às ${snapshot.updatedAtLabel}`
                        : `Atualizado às ${snapshot.updatedAtLabel}`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="font-display text-base font-bold text-[#0F172A]">
                  {snapshot.summaryReason}
                </p>
                <ul className="mt-2.5 space-y-1.5">
                  {snapshot.reasons.slice(0, 3).map((reason) => (
                    <li
                      key={reason}
                      className="flex items-start gap-2.5 text-sm text-[#475569]"
                    >
                      <span
                        className="mt-2 h-1.5 w-1.5 rounded-full bg-[#0284C7] shrink-0"
                        aria-hidden="true"
                      />
                      <span className="leading-relaxed">{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>

            {/* Clima agora + Mar e ondas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
              <Card padding="md" className="flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h2 className="font-display text-base font-bold text-[#0F172A]">
                    Clima agora
                  </h2>
                  <WeatherIcon
                    condition={snapshot.condition}
                    isNight={isRioNighttime()}
                    className="h-5 w-5"
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-[#475569]">
                      <Thermometer className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
                      Temperatura
                    </span>
                    <p className="mt-1 text-xl font-bold text-[#0F172A] tabular-nums">
                      {snapshot.temperatureC !== null ? `${snapshot.temperatureC}°C` : '—'}
                    </p>
                  </div>

                  <div>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-[#475569]">
                      <Droplets className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
                      Chuva
                    </span>
                    <p className="mt-1 text-xl font-bold text-[#0F172A] tabular-nums">
                      {snapshot.rainProb !== null ? `${snapshot.rainProb}%` : '—'}
                      {snapshot.rainMm !== null && (
                        <span className="ml-1 text-xs font-normal text-[#475569]">
                          ({snapshot.rainMm} mm)
                        </span>
                      )}
                    </p>
                  </div>

                  <div>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-[#475569]">
                      <Wind className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
                      Vento
                    </span>
                    <p className="mt-1 text-xl font-bold text-[#0F172A] tabular-nums">
                      {snapshot.windKmh !== null ? `${snapshot.windKmh} km/h` : '—'}
                    </p>
                  </div>

                  <div>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-[#475569]">
                      <Cloud className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
                      Nuvens e UV
                    </span>
                    <p className="mt-1 text-xl font-bold text-[#0F172A] tabular-nums">
                      {snapshot.cloudCover !== null ? `${snapshot.cloudCover}%` : '—'}
                      <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-[#475569]">
                        <Sun className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                        {snapshot.uvIndex !== null ? `UV ${snapshot.uvIndex}` : 'UV —'}
                      </span>
                    </p>
                  </div>
                </div>
              </Card>

              <Card padding="md" className="flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h2 className="font-display text-base font-bold text-[#0F172A]">
                    Mar e ondas
                  </h2>
                  <Waves className="h-5 w-5 text-[#0284C7]" aria-hidden="true" />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-[#475569]">
                      <Waves className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
                      Altura das ondas
                    </span>
                    <p className="mt-1 text-xl font-bold text-[#0F172A] tabular-nums">
                      {snapshot.waveHeightM !== null ? `${snapshot.waveHeightM.toFixed(1)} m` : '—'}
                    </p>
                  </div>

                  <div>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-[#475569]">
                      <Clock className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
                      Período
                    </span>
                    <p className="mt-1 text-xl font-bold text-[#0F172A] tabular-nums">
                      {snapshot.wavePeriodS !== null ? `${snapshot.wavePeriodS} s` : '—'}
                    </p>
                  </div>

                  <div>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-[#475569]">
                      <Compass className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
                      Direção do mar
                    </span>
                    <p className="mt-1 text-base font-bold text-[#0F172A] tabular-nums">
                      {snapshot.waveDirDeg !== null
                        ? formatCompassDirection(snapshot.waveDirDeg)
                        : '—'}
                    </p>
                  </div>

                  <div>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-[#475569]">
                      <Thermometer className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
                      Água do mar
                    </span>
                    <p className="mt-1 text-xl font-bold text-[#0F172A] tabular-nums">
                      {snapshot.seaTempC !== null ? `${snapshot.seaTempC}°C` : '—'}
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Carrossel horizontal próximas 12 horas */}
            <Card padding="md">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold text-[#0F172A]">
                  Próximas 12 horas
                </h2>
                <span className="text-xs text-[#475569]">Deslize para ver</span>
              </div>

              <div className="mt-3.5 flex gap-2.5 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-1">
                {snapshot.hourlyForecast.map((point) => (
                  <div
                    key={point.timeLabel}
                    className="snap-start flex w-24 shrink-0 flex-col items-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-3 text-center"
                  >
                    <span className="text-xs font-bold text-[#475569] tabular-nums">
                      {point.timeLabel}
                    </span>
                    <div className="my-2">
                      <WeatherIcon condition={point.condition} className="h-5 w-5" />
                    </div>
                    <span className="text-base font-extrabold text-[#0F172A] tabular-nums">
                      {point.temperatureC !== null ? `${point.temperatureC}°C` : '—'}
                    </span>
                    <span className="mt-1 text-[11px] text-[#475569] tabular-nums">
                      {point.rainProb !== null ? `${point.rainProb}% chuva` : '—'}
                    </span>
                    <span className="mt-0.5 text-[11px] font-semibold text-[#0284C7] tabular-nums">
                      {point.waveHeightM !== null ? `${point.waveHeightM.toFixed(1)} m` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Câmera / Referência visual */}
            <Card padding="md">
              <div className="flex items-start gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#0284C7]">
                  <Camera className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-display text-base font-bold text-[#0F172A]">
                    Visão da praia
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-[#475569]">
                    Sem câmera ao vivo disponível para {beach.name}. Confira os relatos da
                    comunidade abaixo para saber como está a areia neste momento.
                  </p>
                </div>
              </div>
            </Card>

            {/* Relatos da praia com CTA em forte destaque */}
            <section className="space-y-4 pt-1">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold text-[#0F172A]">
                    Relatos em {beach.name}{' '}
                    {!reportsLoading && !reportsError && (
                      <span className="text-[#475569] font-semibold tabular-nums">
                        ({beachReportsTotal})
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-[#475569]">
                    Impressões recentes de quem passou pela areia
                  </p>
                </div>

                <Link
                  to={`/relatar?praia=${beach.slug}`}
                  className="min-h-[48px] w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#0284C7] px-5 py-3 text-sm font-bold text-white hover:bg-sky-700 transition-colors whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Postar relato aqui
                </Link>
              </div>

              {deleteError && (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#EF4444]/30 bg-[#FEE2E2] px-4 py-2.5 text-sm font-medium text-[#991B1B]"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{deleteError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteError(null)}
                    aria-label="Fechar erro"
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-red-200/50 transition-colors"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}

              {reportsLoading ? (
                <div className="space-y-3.5" aria-busy="true">
                  {[1, 2].map((n) => (
                    <Card key={n} padding="md">
                      <div className="space-y-3">
                        <Skeleton className="h-10 w-44" />
                        <Skeleton className="h-4 w-full" />
                      </div>
                    </Card>
                  ))}
                </div>
              ) : reportsError && beachReports.length === 0 ? (
                <ErrorState
                  title={`Não foi possível carregar os relatos de ${beach.name}`}
                  description={reportsError}
                  onRetry={() => void loadBeachReports(beach.id, 1, false)}
                />
              ) : beachReports.length === 0 ? (
                <EmptyState
                  dashed
                  icon={<MessageSquarePlus className="h-6 w-6" aria-hidden="true" />}
                  title={`Ainda não há relatos de ${beach.name}`}
                  description="Está por aí ou passou perto da orla? Seu relato rápido ajuda outras pessoas a decidirem se vale ir agora."
                  action={
                    <Link
                      to={`/relatar?praia=${beach.slug}`}
                      className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#0284C7] px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 transition-colors"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Fazer o primeiro relato
                    </Link>
                  }
                />
              ) : (
                <div className="space-y-3.5">
                  {helpfulActions.hasHelpfulLoadError && (
                    <div
                      role="alert"
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#F59E0B]/40 bg-[#FEF3C7] px-3.5 py-2.5 text-xs sm:text-sm font-medium text-[#92400E]"
                    >
                      <span>Não foi possível carregar as contagens de “Foi útil” agora.</span>
                      <Button
                        variant="secondary"
                        size="md"
                        loading={helpfulActions.isRetryingHelpful}
                        onClick={() => void helpfulActions.retryHelpfulSummaries()}
                      >
                        Tentar novamente
                      </Button>
                    </div>
                  )}

                  {beachReports.map((report) => (
                    <ReportCard
                      key={report.id}
                      report={report}
                      showBeachLink={false}
                      currentUserId={user?.id ?? null}
                      isHelpfulPending={helpfulActions.pendingHelpfulIds.has(report.id)}
                      helpfulError={helpfulActions.helpfulErrorById[report.id] ?? null}
                      onToggleHelpful={helpfulActions.handleToggleHelpful}
                      onDismissHelpfulError={helpfulActions.dismissHelpfulError}
                      onDeleteRequest={
                        user?.id === report.userId
                          ? (id) => setReportPendingDelete(id)
                          : undefined
                      }
                    />
                  ))}

                  {reportsHasMore && (
                    <div className="flex justify-center pt-1">
                      <Button
                        variant="secondary"
                        loading={reportsLoadingMore}
                        disabled={reportsLoadingMore}
                        onClick={() =>
                          void loadBeachReports(beach.id, reportsPage + 1, true)
                        }
                      >
                        {reportsLoadingMore ? 'Carregando...' : 'Carregar mais relatos'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Aviso de segurança claro e equilibrado */}
            <SafetyNotice variant="prominent" />

            {/* Atribuição discreta Open-Meteo */}
            <footer className="pt-1 text-center text-xs text-[#475569]">
              Dados de clima e mar por{' '}
              <a
                href="https://open-meteo.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#0284C7] hover:underline"
              >
                Open-Meteo.com
              </a>
            </footer>
          </>
        )}
      </main>

      <ConfirmModal
        open={reportPendingDelete !== null}
        title="Excluir este relato?"
        description="Ele será removido permanentemente da praia e do seu perfil."
        confirmLabel="Excluir relato"
        cancelLabel="Manter"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setReportPendingDelete(null)}
      />
    </div>
  );
}
