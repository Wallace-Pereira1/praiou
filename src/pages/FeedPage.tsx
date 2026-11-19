import { AlertTriangle, CheckCircle2, Plus, Star, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { ReportCard } from '../components/social/ReportCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { useApp } from '../context/AppContext';
import { useReportHelpfulActions } from '../hooks/useReportHelpfulActions';
import * as reportsService from '../services/reports';
import type { BeachReport } from '../types';

interface FeedLocationState {
  newReportId?: string;
  createdReport?: BeachReport;
}

export function FeedPage() {
  const { beaches, user, authReady } = useApp();
  const location = useLocation();
  const state = location.state as FeedLocationState | null;

  const [selectedBeachId, setSelectedBeachId] = useState<string>('all');
  const [highlightedId, setHighlightedId] = useState<string | null>(
    state?.newReportId ?? null
  );
  const confirmedCreatedReportRef = useRef<BeachReport | null>(
    state?.createdReport ?? null
  );
  const loadRequestIdRef = useRef(0);
  const deleteEpochRef = useRef(0);
  const deletedReportIdsRef = useRef<Set<string>>(new Set());

  const [items, setItems] = useState<BeachReport[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadReportsError, setLoadReportsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reportPendingDelete, setReportPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    if (state?.newReportId) {
      setHighlightedId(state.newReportId);
      setSelectedBeachId('all');
    }
    if (
      state?.createdReport &&
      !deletedReportIdsRef.current.has(state.createdReport.id)
    ) {
      confirmedCreatedReportRef.current = state.createdReport;
      setItems((prev) => {
        if (prev.some((r) => r.id === state.createdReport!.id)) return prev;
        return [state.createdReport!, ...prev];
      });
    }
  }, [state?.createdReport, state?.newReportId]);

  const loadReportsPage = useCallback(
    async (targetPage: number, beachFilter: string, append: boolean) => {
      const requestId = ++loadRequestIdRef.current;
      const startDeleteEpoch = deleteEpochRef.current;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setLoadReportsError(null);

      try {
        const result = await reportsService.getAllReports({
          page: targetPage,
          pageSize: reportsService.DEFAULT_REPORTS_PAGE_SIZE,
          beachId: beachFilter === 'all' ? undefined : beachFilter,
        });

        if (requestId !== loadRequestIdRef.current) {
          return;
        }

        const filteredItems = result.items.filter(
          (r) => !deletedReportIdsRef.current.has(r.id)
        );
        const deletedDuringFetch = startDeleteEpoch !== deleteEpochRef.current;

        setPage(result.page);
        setHasMore(result.hasMore);

        if (append) {
          setItems((prev) => {
            const seen = new Set(prev.map((r) => r.id));
            const next = filteredItems.filter((r) => !seen.has(r.id));
            return [...prev, ...next];
          });
          if (!deletedDuringFetch) {
            setTotalCount(result.totalCount);
          }
        } else {
          let nextItems = filteredItems;
          let nextTotal = result.totalCount;

          const createdReport = confirmedCreatedReportRef.current;
          if (
            beachFilter === 'all' &&
            createdReport &&
            !deletedReportIdsRef.current.has(createdReport.id) &&
            !nextItems.some((r) => r.id === createdReport.id)
          ) {
            nextItems = [createdReport, ...nextItems];
            nextTotal = Math.max(nextTotal, nextItems.length);
          }

          setItems(nextItems);
          if (!deletedDuringFetch) {
            setTotalCount(nextTotal);
          }
        }
      } catch (err) {
        if (requestId !== loadRequestIdRef.current) {
          return;
        }
        if (!append) {
          setItems([]);
          setTotalCount(0);
          setHasMore(false);
        }
        setLoadReportsError(
          err instanceof Error
            ? err.message
            : 'Houve uma instabilidade temporária ao buscar os relatos da comunidade.'
        );
      } finally {
        if (requestId === loadRequestIdRef.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!authReady) return;
    void loadReportsPage(1, selectedBeachId, false);
  }, [authReady, selectedBeachId, loadReportsPage]);

  const helpfulActions = useReportHelpfulActions({
    userId: user?.id ?? null,
    authReady,
    items,
    setItems,
    returnTo: `${location.pathname}${location.search}`,
  });

  const handleLoadMore = () => {
    if (isLoadingMore || !hasMore) return;
    void loadReportsPage(page + 1, selectedBeachId, true);
  };

  const handleConfirmDelete = async () => {
    if (!reportPendingDelete) return;
    const targetId = reportPendingDelete;
    setReportPendingDelete(null);
    setActionError(null);

    try {
      await reportsService.deleteReport(targetId);
      deletedReportIdsRef.current.add(targetId);
      deleteEpochRef.current += 1;

      if (confirmedCreatedReportRef.current?.id === targetId) {
        confirmedCreatedReportRef.current = null;
      }

      setItems((prev) => prev.filter((r) => r.id !== targetId));
      setTotalCount((prev) => Math.max(0, prev - 1));
      if (highlightedId === targetId) {
        setHighlightedId(null);
      }
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível excluir o relato agora.'
      );
    }
  };

  const selectedBeach = beaches.find((b) => b.id === selectedBeachId);

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F172A]">
              Relatos da galera{' '}
              {!isLoading && !loadReportsError && (
                <span className="text-lg sm:text-xl font-semibold text-[#475569] tabular-nums">
                  ({totalCount})
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-[#475569]">
              Impressões reais de quem está na areia agora.
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

        {actionError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-[#EF4444]/30 bg-[#FEE2E2] px-4 py-2.5 text-sm font-medium text-[#991B1B]"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{actionError}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              aria-label="Fechar erro"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-red-200/50 transition-colors"
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
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy="true">
            {[1, 2, 3, 4].map((n) => (
              <Card key={n} padding="md">
                <div className="space-y-3">
                  <Skeleton className="h-10 w-48" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </Card>
            ))}
          </div>
        ) : loadReportsError && items.length === 0 ? (
          <ErrorState
            title="Não foi possível carregar os relatos"
            description={loadReportsError}
            onRetry={() => void loadReportsPage(1, selectedBeachId, false)}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Star className="h-6 w-6" aria-hidden="true" />}
            title={
              selectedBeach
                ? `Nenhum relato recente em ${selectedBeach.name}`
                : 'Ainda não há relatos publicados'
            }
            description="Ainda ninguém postou por aqui. Se você está perto da orla, compartilhe como está o mar."
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
          <div className="space-y-4">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  showBeachLink
                  highlighted={report.id === highlightedId}
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
            </div>

            {loadReportsError && (
              <p className="text-center text-xs font-medium text-[#991B1B]">
                {loadReportsError}
              </p>
            )}

            {hasMore && (
              <div className="flex justify-center pt-1">
                <Button
                  variant="secondary"
                  loading={isLoadingMore}
                  disabled={isLoadingMore}
                  onClick={handleLoadMore}
                >
                  {isLoadingMore ? 'Carregando...' : 'Carregar mais relatos'}
                </Button>
              </div>
            )}
          </div>
        )}

        <ConfirmModal
          open={reportPendingDelete !== null}
          title="Excluir este relato?"
          description="Ele será removido permanentemente do feed e do seu perfil."
          confirmLabel="Excluir relato"
          cancelLabel="Manter"
          destructive
          onConfirm={handleConfirmDelete}
          onCancel={() => setReportPendingDelete(null)}
        />
      </div>
    </AppLayout>
  );
}
