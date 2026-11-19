import {
  AlertTriangle,
  ArrowDownWideNarrow,
  Moon,
  RefreshCw,
  Search,
  Sun,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BeachCard } from '../components/beach/BeachCard';
import { BeachCardSkeleton } from '../components/beach/BeachCardSkeleton';
import { AppLayout } from '../components/layout/AppLayout';
import { SafetyNotice } from '../components/layout/SafetyNotice';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { useApp } from '../context/AppContext';
import {
  isRioNighttime,
  rankAndFilterBeaches,
  type BeachRegionFilter,
  type BeachSortMode,
} from '../utils/beachRanking';

const REGION_FILTER_OPTIONS: { id: BeachRegionFilter; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'zona-sul', label: 'Zona Sul' },
  { id: 'zona-oeste', label: 'Zona Oeste' },
];

const SORT_OPTIONS: { id: BeachSortMode; label: string }[] = [
  { id: 'melhor-agora', label: 'Melhores condições agora' },
  { id: 'ordem-original', label: 'Ordem original' },
  { id: 'nome', label: 'Nome da praia' },
];

export function HomePage() {
  const {
    beaches,
    getSnapshotByBeachId,
    isInitialLoading,
    loadError,
    refreshData,
    safetyBannerDismissed,
    dismissSafetyBanner,
  } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const devState = import.meta.env.DEV ? searchParams.get('estado') : null;

  const [regionFilter, setRegionFilter] = useState<BeachRegionFilter>('todas');
  const [sortMode, setSortMode] = useState<BeachSortMode>('melhor-agora');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastManualRefresh, setLastManualRefresh] = useState<string | null>(null);

  const isLoading = isInitialLoading || isRefreshing || devState === 'loading';
  const hasError =
    (!isLoading && Boolean(loadError)) || (!isRefreshing && devState === 'erro');
  const isNight = isRioNighttime();

  const handleManualRefresh = async () => {
    if (devState) {
      setSearchParams({}, { replace: true });
    }
    setIsRefreshing(true);
    try {
      await refreshData(true);
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      setLastManualRefresh(`${hh}:${mm}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const rankingSummary = useMemo(
    () =>
      rankAndFilterBeaches({
        beaches,
        getSnapshotByBeachId,
        regionFilter,
        searchQuery,
        sortMode,
      }),
    [beaches, getSnapshotByBeachId, regionFilter, searchQuery, sortMode]
  );

  const clearFilters = () => {
    setRegionFilter('todas');
    setSearchQuery('');
  };

  const sectionTitle =
    sortMode === 'melhor-agora'
      ? 'Melhores condições para curtir a praia'
      : sortMode === 'ordem-original'
        ? 'Praias do Rio na ordem original'
        : 'Praias do Rio em ordem alfabética';

  return (
    <AppLayout>
      <div className="min-w-0 space-y-4 sm:space-y-5">
        {/* Cabeçalho da página */}
        <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F172A] text-balance">
              Praias do Rio agora
            </h1>
            <p className="mt-1 text-sm text-[#475569]">
              Estimativas rápidas de tempo e mar para ajudar você a escolher sua praia.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {lastManualRefresh && !isLoading && !hasError && (
              <span className="text-xs text-[#475569] tabular-nums">
                Atualizado às {lastManualRefresh}
              </span>
            )}
            <Button
              variant="secondary"
              onClick={handleManualRefresh}
              disabled={isLoading}
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? 'animate-spin text-[#0284C7]' : ''}`}
                aria-hidden="true"
              />
              {isLoading ? 'Atualizando...' : 'Atualizar'}
            </Button>
          </div>
        </section>

        {/* Aviso de segurança discreto e dispensável */}
        {!safetyBannerDismissed && (
          <SafetyNotice dismissible onDismiss={dismissSafetyBanner} variant="compact" />
        )}

        {/* Filtros por região, busca e seletor de ordenação */}
        <section
          aria-label="Filtros e ordenação de praias"
          className="space-y-2.5"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex max-w-full items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
              {REGION_FILTER_OPTIONS.map((option) => {
                const active = regionFilter === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setRegionFilter(option.id)}
                    className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[#0284C7] text-white'
                        : 'border border-[#E2E8F0] bg-white text-[#475569] hover:text-[#0F172A]'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-2">
                <label
                  htmlFor="beach-sort-select"
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#475569] whitespace-nowrap"
                >
                  <ArrowDownWideNarrow className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
                  Ordenar:
                </label>
                <select
                  id="beach-sort-select"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as BeachSortMode)}
                  className="min-h-[44px] min-w-0 flex-1 sm:flex-none rounded-xl border border-[#E2E8F0] bg-white px-3 text-sm font-semibold text-[#0F172A] focus:border-[#0284C7] focus:outline-none"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative w-full sm:w-56 shrink-0">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#475569]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar praia..."
                  aria-label="Buscar praia pelo nome"
                  className="min-h-[44px] w-full rounded-xl border border-[#E2E8F0] bg-white pl-10 pr-10 text-sm text-[#0F172A] placeholder:text-[#475569]/70 focus:border-[#0284C7] focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Limpar busca"
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#475569] hover:bg-slate-100"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Estado: Loading */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5" aria-busy="true">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <BeachCardSkeleton key={n} />
            ))}
          </div>
        )}

        {/* Estado: Erro */}
        {!isLoading && hasError && (
          <ErrorState
            title="Não foi possível atualizar as praias agora"
            description="Houve uma instabilidade momentânea ao carregar as condições do mar e do tempo."
            onRetry={handleManualRefresh}
          />
        )}

        {/* Estado: Filtro sem resultado */}
        {!isLoading && !hasError && rankingSummary.entries.length === 0 && (
          <EmptyState
            icon={<Sun className="h-6 w-6" aria-hidden="true" />}
            title="Nenhuma praia encontrada nesse filtro"
            description="Limpe a busca ou volte para todas as praias do Rio para ver as condições atuais."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Mostrar todas as praias
              </Button>
            }
          />
        )}

        {/* Lista / Ranking de praias */}
        {!isLoading && !hasError && rankingSummary.entries.length > 0 && (
          <section aria-labelledby="beach-ranking-heading" className="space-y-3.5">
            <div className="space-y-1">
              <h2
                id="beach-ranking-heading"
                className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-[#0F172A]"
              >
                {sectionTitle}
              </h2>
              <p className="text-xs leading-relaxed text-[#475569]">
                Ranking por condições estimadas de tempo e mar. Não indica balneabilidade nem garante segurança para banho.
              </p>
            </div>

            {isNight && (
              <div
                role="note"
                className="flex items-start gap-2 rounded-xl border border-[#E2E8F0] bg-slate-50 px-3.5 py-2.5 text-xs text-[#475569]"
              >
                <Moon className="h-4 w-4 mt-0.5 shrink-0 text-slate-600" aria-hidden="true" />
                <span>
                  Período noturno no Rio: exibindo leituras estimadas para a noite atual, sem previsão resumida para amanhã.
                </span>
              </div>
            )}

            {sortMode === 'melhor-agora' && rankingSummary.hasNoFavorableCurrentBeaches && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-xl border border-[#F59E0B]/40 bg-[#FEF3C7] px-3.5 py-3 text-xs sm:text-sm font-medium text-[#92400E]"
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Nenhuma praia apresenta condições favoráveis no momento. O 1º lugar indica apenas a opção menos desfavorável na estimativa atual, não uma recomendação positiva.
                </span>
              </div>
            )}

            {rankingSummary.currentCount === 0 && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-xl border border-[#F59E0B]/40 bg-[#FEF3C7] px-3.5 py-3 text-xs sm:text-sm font-medium text-[#92400E]"
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Sem leituras climáticas atuais no momento. Os cartões abaixo mostram apenas dados desatualizados ou indisponíveis.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {rankingSummary.entries.map((entry) => (
                <BeachCard
                  key={entry.beach.id}
                  beach={entry.beach}
                  snapshot={entry.snapshot}
                  availability={entry.availability}
                  validScore={entry.validScore}
                  rank={entry.rank}
                  isTied={entry.isTied}
                  isPartial={entry.isPartial}
                  isNight={isNight}
                />
              ))}
            </div>
          </section>
        )}

        {/* Atribuição discreta Open-Meteo */}
        <footer className="pt-2 text-center text-xs text-[#475569]">
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
      </div>
    </AppLayout>
  );
}
