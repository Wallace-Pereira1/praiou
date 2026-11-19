import { CheckCircle2, Plus, Star, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { ReportCard } from '../components/social/ReportCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { useApp } from '../context/AppContext';

interface FeedLocationState {
  newReportId?: string;
}

export function FeedPage() {
  const {
    beaches,
    reports,
    flaggedReportIds,
    flagReport,
    isInitialLoading,
    loadError,
    refreshData,
  } = useApp();
  const location = useLocation();
  const state = location.state as FeedLocationState | null;

  const [selectedBeachId, setSelectedBeachId] = useState<string>('all');
  const [highlightedId, setHighlightedId] = useState<string | null>(
    state?.newReportId ?? null
  );

  useEffect(() => {
    if (state?.newReportId) {
      setHighlightedId(state.newReportId);
      setSelectedBeachId('all');
    }
  }, [state?.newReportId]);

  const filteredReports = useMemo(() => {
    if (selectedBeachId === 'all') return reports;
    return reports.filter((r) => r.beachId === selectedBeachId);
  }, [reports, selectedBeachId]);

  const selectedBeach = beaches.find((b) => b.id === selectedBeachId);

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F172A]">
              Relatos da galera
            </h1>
            <p className="mt-1 text-sm text-[#475569]">
              Fotos e impressões reais de quem está na areia agora.
            </p>
          </div>

          <Link
            to="/relatar"
            className="min-h-[48px] w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#0284C7] px-5 py-3 text-sm font-bold text-white hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo relato
          </Link>
        </div>

        {/* Feedback discreto de relato recém-publicado */}
        {highlightedId && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-xl border border-[#10B981]/35 bg-[#DCFCE7] px-4 py-2.5 text-sm font-medium text-[#166534]"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Seu relato foi publicado no topo do feed!</span>
            </div>
            <button
              type="button"
              onClick={() => setHighlightedId(null)}
              aria-label="Fechar aviso"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-emerald-200/50 transition-colors"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Filtro por praia */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => setSelectedBeachId('all')}
            className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
              selectedBeachId === 'all'
                ? 'bg-[#0284C7] text-white'
                : 'border border-[#E2E8F0] bg-white text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Todas as praias
          </button>

          {beaches.map((beach) => {
            const active = selectedBeachId === beach.id;
            return (
              <button
                key={beach.id}
                type="button"
                onClick={() => setSelectedBeachId(beach.id)}
                className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#0284C7] text-white'
                    : 'border border-[#E2E8F0] bg-white text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                {beach.name}
              </button>
            );
          })}
        </div>

        {/* Lista, loading, erro ou estado vazio */}
        {isInitialLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy="true">
            {[1, 2, 3, 4].map((n) => (
              <Card key={n} padding="md">
                <div className="space-y-3">
                  <Skeleton className="h-10 w-48" />
                  <Skeleton className="h-48 w-full rounded-xl" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </Card>
            ))}
          </div>
        ) : loadError ? (
          <ErrorState
            title="Não foi possível carregar os relatos"
            description="Houve uma instabilidade temporária ao buscar os relatos da comunidade."
            onRetry={() => void refreshData()}
          />
        ) : filteredReports.length === 0 ? (
          <EmptyState
            icon={<Star className="h-6 w-6" aria-hidden="true" />}
            title={`Nenhum relato recente em ${selectedBeach?.name ?? 'essa praia'}`}
            description="Ainda ninguém postou sobre essa praia hoje. Se você está por perto, compartilhe como está o mar."
            action={
              <>
                <Link
                  to={`/relatar${selectedBeach ? `?praia=${selectedBeach.slug}` : ''}`}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#0284C7] px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 transition-colors"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Novo relato
                </Link>
                {selectedBeachId !== 'all' && (
                  <Button variant="secondary" onClick={() => setSelectedBeachId('all')}>
                    Ver todas as praias
                  </Button>
                )}
              </>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredReports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                showBeachLink
                highlighted={report.id === highlightedId}
                isFlagged={flaggedReportIds.includes(report.id)}
                onFlag={flagReport}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
