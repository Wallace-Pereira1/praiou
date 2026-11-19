import { ArrowDownWideNarrow, RefreshCw, Search, Sun, X } from 'lucide-react';
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
import type { Beach, BeachSnapshot } from '../types';

type HomeFilter = 'todas' | 'zona-sul' | 'zona-oeste' | 'melhor-agora';

const FILTER_OPTIONS: { id: HomeFilter; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'zona-sul', label: 'Zona Sul' },
  { id: 'zona-oeste', label: 'Zona Oeste' },
  { id: 'melhor-agora', label: 'Melhor agora' },
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

  const [activeFilter, setActiveFilter] = useState<HomeFilter>('todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastManualRefresh, setLastManualRefresh] = useState<string | null>(null);

  const isLoading = isInitialLoading || isRefreshing || devState === 'loading';
  const hasError =
    (!isLoading && Boolean(loadError)) || (!isRefreshing && devState === 'erro');

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

  const items = useMemo(() => {
    const joined = beaches
      .map((beach) => {
        const snapshot = getSnapshotByBeachId(beach.id);
        return snapshot ? { beach, snapshot } : null;
      })
      .filter((item): item is { beach: Beach; snapshot: BeachSnapshot } => item !== null);

    const byRegion = joined.filter(({ beach }) => {
      if (activeFilter === 'zona-sul') return beach.region === 'Zona Sul';
      if (activeFilter === 'zona-oeste') return beach.region === 'Zona Oeste';
      return true;
    });

    const normalizedSearch = searchQuery.trim().toLowerCase();
    const bySearch = normalizedSearch
      ? byRegion.filter(
          ({ beach }) =>
            beach.name.toLowerCase().includes(normalizedSearch) ||
            beach.region.toLowerCase().includes(normalizedSearch)
        )
      : byRegion;

    if (activeFilter === 'melhor-agora') {
      return [...bySearch].sort((a, b) => b.snapshot.score - a.snapshot.score);
    }

    return [...bySearch].sort((a, b) => a.beach.sortOrder - b.beach.sortOrder);
  }, [beaches, getSnapshotByBeachId, activeFilter, searchQuery]);

  const clearFilters = () => {
    setActiveFilter('todas');
    setSearchQuery('');
  };

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-5">
        {/* Cabeçalho da página */}
        <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F172A] text-balance">
              Praias do Rio agora
            </h1>
            <p className="mt-1 text-sm text-[#475569]">
              Vale ir pra praia agora? A resposta em 3 segundos.
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

        {/* Filtros horizontais e busca */}
        <section
          aria-label="Filtros de praias"
          className="space-y-2.5"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
              {FILTER_OPTIONS.map((option) => {
                const active = activeFilter === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setActiveFilter(option.id)}
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

            <div className="relative w-full md:w-64 shrink-0">
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

          {activeFilter === 'melhor-agora' && !isLoading && !hasError && (
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0284C7]">
              <ArrowDownWideNarrow className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Ordenado pelo maior índice Praiou? neste momento
            </p>
          )}
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
        {!isLoading && !hasError && items.length === 0 && (
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

        {/* Lista de praias */}
        {!isLoading && !hasError && items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {items.map(({ beach, snapshot }) => (
              <BeachCard key={beach.id} beach={beach} snapshot={snapshot} />
            ))}
          </div>
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
