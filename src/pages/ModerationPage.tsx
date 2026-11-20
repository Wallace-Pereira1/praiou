import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FileText,
  Flag,
  History,
  Info,
  Loader2,
  MapPin,
  Maximize2,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ThumbsUp,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthMethodsPanel } from '../components/auth/AuthMethodsPanel';
import { AppLayout } from '../components/layout/AppLayout';
import { ModerationDecisionModal } from '../components/social/ModerationDecisionModal';
import { ReportPhotoViewerModal } from '../components/social/ReportPhotoViewerModal';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { useApp } from '../context/AppContext';
import {
  DEFAULT_MODERATION_PAGE_SIZE,
  ModerationConflictError,
  ModerationUnauthorizedError,
  getFlagReasonLabel,
  getFlagStatusLabel,
  getModerationActionLabel,
  getModerationQueue,
  getModerationRepliesQueue,
  moderateReply,
  moderateReport,
} from '../services/moderation';
import type {
  ModerationQueueFilter,
  ModerationReplyItem,
  ModerationReportItem,
  ModerationTargetKind,
} from '../types';
import { formatRelativeTime, getInitials } from '../utils/formatters';
import { formatReportConditionsSummary } from '../utils/reportConditions';

function formatExactDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

type DecisionModalTarget =
  | { kind: 'report'; action: 'hide' | 'restore'; item: ModerationReportItem }
  | { kind: 'reply'; action: 'hide' | 'restore'; item: ModerationReplyItem };

export function ModerationPage() {
  const { user, isModerator, moderatorReady, authReady } = useApp();

  const [targetKind, setTargetKind] = useState<ModerationTargetKind>('report');
  const [filter, setFilter] = useState<ModerationQueueFilter>('pending');

  const [reportItems, setReportItems] = useState<ModerationReportItem[]>([]);
  const [reportPage, setReportPage] = useState(1);
  const [reportHasMore, setReportHasMore] = useState(false);
  const [pendingReportsCount, setPendingReportsCount] = useState(0);
  const [resolvedReportsCount, setResolvedReportsCount] = useState(0);

  const [replyItems, setReplyItems] = useState<ModerationReplyItem[]>([]);
  const [replyPage, setReplyPage] = useState(1);
  const [replyHasMore, setReplyHasMore] = useState(false);
  const [pendingRepliesCount, setPendingRepliesCount] = useState(0);
  const [resolvedRepliesCount, setResolvedRepliesCount] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unauthorizedError, setUnauthorizedError] = useState(false);

  const [pendingDecisionIds, setPendingDecisionIds] = useState<Set<string>>(
    () => new Set()
  );
  const pendingDecisionSetRef = useRef<Set<string>>(new Set());
  const [cardErrorById, setCardErrorById] = useState<Record<string, string>>({});
  const [conflictBanner, setConflictBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const [expandedFlagsIds, setExpandedFlagsIds] = useState<Set<string>>(
    () => new Set()
  );
  const [expandedLogsIds, setExpandedLogsIds] = useState<Set<string>>(
    () => new Set()
  );

  const [decisionModalState, setDecisionModalState] =
    useState<DecisionModalTarget | null>(null);
  const [decisionModalError, setDecisionModalError] = useState<string | null>(null);

  const [photoViewerItem, setPhotoViewerItem] = useState<ModerationReportItem | null>(
    null
  );

  const loadRequestIdRef = useRef(0);

  const loadQueue = useCallback(
    async (
      kind: ModerationTargetKind,
      targetFilter: ModerationQueueFilter,
      targetPage: number,
      append: boolean
    ) => {
      const requestId = ++loadRequestIdRef.current;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setLoadError(null);
      setUnauthorizedError(false);

      try {
        if (kind === 'report') {
          const [reportResult, replySummaryOutcome] = await Promise.allSettled([
            getModerationQueue({
              filter: targetFilter,
              page: targetPage,
              pageSize: DEFAULT_MODERATION_PAGE_SIZE,
            }),
            !append && targetPage === 1
              ? getModerationRepliesQueue({
                  filter: targetFilter,
                  page: 1,
                  pageSize: 1,
                })
              : Promise.resolve(null),
          ]);

          if (requestId !== loadRequestIdRef.current) return;

          if (reportResult.status !== 'fulfilled') {
            throw reportResult.reason;
          }

          const res = reportResult.value;
          setReportPage(res.page);
          setReportHasMore(res.hasMore);
          setPendingReportsCount(res.pendingReportsCount);
          setResolvedReportsCount(res.resolvedReportsCount);

          if (
            replySummaryOutcome.status === 'fulfilled' &&
            replySummaryOutcome.value !== null
          ) {
            setPendingRepliesCount(replySummaryOutcome.value.pendingRepliesCount);
            setResolvedRepliesCount(replySummaryOutcome.value.resolvedRepliesCount);
          }

          if (append) {
            setReportItems((prev) => {
              const seen = new Set(prev.map((i) => i.reportId));
              const next = res.items.filter((i) => !seen.has(i.reportId));
              return [...prev, ...next];
            });
          } else {
            setReportItems(res.items);
          }
        } else {
          const [replyResult, reportSummaryOutcome] = await Promise.allSettled([
            getModerationRepliesQueue({
              filter: targetFilter,
              page: targetPage,
              pageSize: DEFAULT_MODERATION_PAGE_SIZE,
            }),
            !append && targetPage === 1
              ? getModerationQueue({
                  filter: targetFilter,
                  page: 1,
                  pageSize: 1,
                })
              : Promise.resolve(null),
          ]);

          if (requestId !== loadRequestIdRef.current) return;

          if (replyResult.status !== 'fulfilled') {
            throw replyResult.reason;
          }

          const res = replyResult.value;
          setReplyPage(res.page);
          setReplyHasMore(res.hasMore);
          setPendingRepliesCount(res.pendingRepliesCount);
          setResolvedRepliesCount(res.resolvedRepliesCount);

          if (
            reportSummaryOutcome.status === 'fulfilled' &&
            reportSummaryOutcome.value !== null
          ) {
            setPendingReportsCount(reportSummaryOutcome.value.pendingReportsCount);
            setResolvedReportsCount(reportSummaryOutcome.value.resolvedReportsCount);
          }

          if (append) {
            setReplyItems((prev) => {
              const seen = new Set(prev.map((i) => i.replyId));
              const next = res.items.filter((i) => !seen.has(i.replyId));
              return [...prev, ...next];
            });
          } else {
            setReplyItems(res.items);
          }
        }
      } catch (err) {
        if (requestId !== loadRequestIdRef.current) {
          return;
        }

        if (err instanceof ModerationUnauthorizedError) {
          setUnauthorizedError(true);
          setReportItems([]);
          setReplyItems([]);
          return;
        }

        if (!append) {
          if (kind === 'report') {
            setReportItems([]);
          } else {
            setReplyItems([]);
          }
        }
        setLoadError(
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar a fila de moderação.'
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
    if (!authReady || !moderatorReady) return;
    if (!user || !isModerator) {
      loadRequestIdRef.current += 1;
      setReportItems([]);
      setReplyItems([]);
      setIsLoading(false);
      return;
    }

    void loadQueue(targetKind, filter, 1, false);
  }, [authReady, moderatorReady, user, isModerator, targetKind, filter, loadQueue]);

  const toggleFlagsExpanded = (key: string) => {
    setExpandedFlagsIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleLogsExpanded = (key: string) => {
    setExpandedLogsIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleKeepReportVisible = async (item: ModerationReportItem) => {
    const busyKey = `report:${item.reportId}`;
    if (pendingDecisionSetRef.current.has(busyKey)) return;

    pendingDecisionSetRef.current.add(busyKey);
    setPendingDecisionIds(new Set(pendingDecisionSetRef.current));
    setConflictBanner(null);
    setSuccessBanner(null);
    setCardErrorById((prev) => {
      if (!(busyKey in prev)) return prev;
      const next = { ...prev };
      delete next[busyKey];
      return next;
    });

    try {
      const result = await moderateReport({
        reportId: item.reportId,
        action: 'keep_visible',
        expectedModerationStatus: item.moderationStatus,
        expectedPendingCount: item.pendingFlagsCount,
      });

      setSuccessBanner(
        `Publicação mantida (${result.flagsResolvedCount} ${
          result.flagsResolvedCount === 1 ? 'denúncia encerrada' : 'denúncias encerradas'
        }).`
      );
      await loadQueue('report', filter, 1, false);
    } catch (err) {
      if (err instanceof ModerationConflictError) {
        setConflictBanner(err.message);
      } else if (err instanceof ModerationUnauthorizedError) {
        setUnauthorizedError(true);
      }

      setCardErrorById((prev) => ({
        ...prev,
        [busyKey]:
          err instanceof Error
            ? err.message
            : 'Não foi possível concluir a decisão agora.',
      }));
    } finally {
      pendingDecisionSetRef.current.delete(busyKey);
      setPendingDecisionIds(new Set(pendingDecisionSetRef.current));
    }
  };

  const handleKeepReplyVisible = async (item: ModerationReplyItem) => {
    const busyKey = `reply:${item.replyId}`;
    if (pendingDecisionSetRef.current.has(busyKey)) return;

    pendingDecisionSetRef.current.add(busyKey);
    setPendingDecisionIds(new Set(pendingDecisionSetRef.current));
    setConflictBanner(null);
    setSuccessBanner(null);
    setCardErrorById((prev) => {
      if (!(busyKey in prev)) return prev;
      const next = { ...prev };
      delete next[busyKey];
      return next;
    });

    try {
      const result = await moderateReply({
        replyId: item.replyId,
        action: 'keep_visible',
        expectedModerationStatus: item.moderationStatus,
        expectedPendingCount: item.pendingFlagsCount,
      });

      setSuccessBanner(
        `Resposta mantida (${result.flagsResolvedCount} ${
          result.flagsResolvedCount === 1 ? 'denúncia encerrada' : 'denúncias encerradas'
        }).`
      );
      await loadQueue('reply', filter, 1, false);
    } catch (err) {
      if (err instanceof ModerationConflictError) {
        setConflictBanner(err.message);
      } else if (err instanceof ModerationUnauthorizedError) {
        setUnauthorizedError(true);
      }

      setCardErrorById((prev) => ({
        ...prev,
        [busyKey]:
          err instanceof Error
            ? err.message
            : 'Não foi possível concluir a decisão agora.',
      }));
    } finally {
      pendingDecisionSetRef.current.delete(busyKey);
      setPendingDecisionIds(new Set(pendingDecisionSetRef.current));
    }
  };

  const handleConfirmModalDecision = async (reason: string) => {
    if (!decisionModalState) return;
    const busyKey =
      decisionModalState.kind === 'report'
        ? `report:${decisionModalState.item.reportId}`
        : `reply:${decisionModalState.item.replyId}`;

    if (pendingDecisionSetRef.current.has(busyKey)) return;

    pendingDecisionSetRef.current.add(busyKey);
    setPendingDecisionIds(new Set(pendingDecisionSetRef.current));
    setDecisionModalError(null);
    setConflictBanner(null);
    setSuccessBanner(null);

    try {
      if (decisionModalState.kind === 'report') {
        const { action, item } = decisionModalState;
        const result = await moderateReport({
          reportId: item.reportId,
          action,
          reason,
          expectedModerationStatus: item.moderationStatus,
          expectedPendingCount: item.pendingFlagsCount,
        });

        setDecisionModalState(null);
        setSuccessBanner(
          action === 'hide'
            ? `Relato ocultado das consultas públicas (${result.flagsResolvedCount} ${
                result.flagsResolvedCount === 1
                  ? 'denúncia encerrada'
                  : 'denúncias encerradas'
              }).`
            : 'Relato restaurado com sucesso para as consultas públicas.'
        );
        await loadQueue('report', filter, 1, false);
      } else {
        const { action, item } = decisionModalState;
        const result = await moderateReply({
          replyId: item.replyId,
          action,
          reason,
          expectedModerationStatus: item.moderationStatus,
          expectedPendingCount: item.pendingFlagsCount,
        });

        setDecisionModalState(null);
        setSuccessBanner(
          action === 'hide'
            ? `Resposta ocultada das conversas públicas (${result.flagsResolvedCount} ${
                result.flagsResolvedCount === 1
                  ? 'denúncia encerrada'
                  : 'denúncias encerradas'
              }).`
            : 'Resposta restaurada com sucesso para a conversa.'
        );
        await loadQueue('reply', filter, 1, false);
      }
    } catch (err) {
      if (err instanceof ModerationConflictError) {
        setConflictBanner(err.message);
      } else if (err instanceof ModerationUnauthorizedError) {
        setDecisionModalState(null);
        setUnauthorizedError(true);
        return;
      }

      setDecisionModalError(
        err instanceof Error
          ? err.message
          : 'Não foi possível registrar a decisão agora.'
      );
    } finally {
      pendingDecisionSetRef.current.delete(busyKey);
      setPendingDecisionIds(new Set(pendingDecisionSetRef.current));
    }
  };

  const isCheckingAccess = !authReady || (Boolean(user) && !moderatorReady);
  const activePendingCount =
    targetKind === 'report' ? pendingReportsCount : pendingRepliesCount;
  const activeResolvedCount =
    targetKind === 'report' ? resolvedReportsCount : resolvedRepliesCount;
  const activeItemsLength =
    targetKind === 'report' ? reportItems.length : replyItems.length;
  const activeHasMore = targetKind === 'report' ? reportHasMore : replyHasMore;
  const activePage = targetKind === 'report' ? reportPage : replyPage;

  const modalBusyKey = decisionModalState
    ? decisionModalState.kind === 'report'
      ? `report:${decisionModalState.item.reportId}`
      : `reply:${decisionModalState.item.replyId}`
    : null;

  return (
    <AppLayout>
      <div className="min-w-0 space-y-5">
        {isCheckingAccess ? (
          <div className="mx-auto max-w-md py-8">
            <Card padding="lg" className="p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-[#0284C7]">
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm font-medium text-[#475569]">
                Verificando permissões de moderação...
              </p>
            </Card>
          </div>
        ) : !user ? (
          <div className="mx-auto max-w-md py-4">
            <EmptyState
              icon={<ShieldCheck className="h-6 w-6" aria-hidden="true" />}
              title="Área restrita à moderação"
              description="Entre com uma conta autorizada para acessar a fila de denúncias."
              action={<AuthMethodsPanel returnTo="/moderacao" />}
            />
          </div>
        ) : !isModerator || unauthorizedError ? (
          <div className="mx-auto max-w-md py-4">
            <EmptyState
              icon={<ShieldAlert className="h-6 w-6 text-[#991B1B]" aria-hidden="true" />}
              title="Acesso restrito"
              description="Sua conta não está cadastrada como moderadora do Praiou?."
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
        ) : (
          <>
            {/* Cabeçalho */}
            <section className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-bold text-[#0284C7]">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Moderação manual
                </div>
                <h1 className="mt-2 font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F172A]">
                  Fila de denúncias
                </h1>
                <p className="mt-1 text-sm text-[#475569]">
                  Revise relatos e respostas denunciados pela comunidade. Decisões são registradas com histórico no banco.
                </p>
              </div>

              <Button
                variant="secondary"
                loading={isLoading}
                disabled={isLoading}
                onClick={() => void loadQueue(targetKind, filter, 1, false)}
                className="self-start sm:self-auto"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Atualizar fila
              </Button>
            </section>

            {/* Aviso explícito sobre limitação de fotos em bucket público (exibido na fila de relatos) */}
            {targetKind === 'report' && (
              <div
                role="note"
                className="flex items-start gap-2.5 rounded-xl border border-[#F59E0B]/40 bg-[#FEF3C7] px-4 py-3 text-xs sm:text-sm text-[#92400E]"
              >
                <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0 space-y-1 leading-relaxed">
                  <p className="font-bold">Limitação explícita sobre fotos públicas</p>
                  <p>
                    O bucket atual de fotos de relatos (<code>report-photos</code>) é público. <strong>Ocultar</strong> retira o relato do aplicativo e das consultas públicas da API, preservando a imagem no Storage para permitir restauração, mas <strong>não revoga nem apaga a URL pública direta da foto na internet</strong>. Conteúdos que exijam retirada efetiva da imagem requerem remoção manual via Storage ou evolução específica para bucket privado.
                  </p>
                </div>
              </div>
            )}

            {successBanner && (
              <div
                role="status"
                className="flex items-center justify-between gap-3 rounded-xl border border-[#10B981]/35 bg-[#DCFCE7] px-4 py-2.5 text-sm font-medium text-[#166534]"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 break-words">{successBanner}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSuccessBanner(null)}
                  className="shrink-0 text-xs font-bold underline"
                >
                  Fechar
                </button>
              </div>
            )}

            {conflictBanner && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#EF4444]/30 bg-[#FEE2E2] px-4 py-3 text-xs sm:text-sm font-medium text-[#991B1B]"
              >
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="min-w-0 break-words">{conflictBanner}</span>
                </div>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    setConflictBanner(null);
                    setCardErrorById({});
                    void loadQueue(targetKind, filter, 1, false);
                  }}
                >
                  Atualizar fila
                </Button>
              </div>
            )}

            {/* Seletor de tipo de conteúdo: Relatos | Respostas */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E2E8F0] pb-3">
              <div
                role="tablist"
                aria-label="Tipo de publicação denunciada"
                className="flex flex-wrap items-center gap-2"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={targetKind === 'report'}
                  onClick={() => {
                    setConflictBanner(null);
                    setTargetKind('report');
                  }}
                  className={`min-h-[44px] inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                    targetKind === 'report'
                      ? 'bg-[#0F172A] text-white'
                      : 'border border-[#E2E8F0] bg-white text-[#475569] hover:text-[#0F172A]'
                  }`}
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  <span>Relatos</span>
                  {pendingReportsCount > 0 && (
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                        targetKind === 'report'
                          ? 'bg-white/20 text-white'
                          : 'bg-amber-100 text-[#92400E]'
                      }`}
                    >
                      {pendingReportsCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={targetKind === 'reply'}
                  onClick={() => {
                    setConflictBanner(null);
                    setTargetKind('reply');
                  }}
                  className={`min-h-[44px] inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                    targetKind === 'reply'
                      ? 'bg-[#0F172A] text-white'
                      : 'border border-[#E2E8F0] bg-white text-[#475569] hover:text-[#0F172A]'
                  }`}
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  <span>Respostas</span>
                  {pendingRepliesCount > 0 && (
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                        targetKind === 'reply'
                          ? 'bg-white/20 text-white'
                          : 'bg-amber-100 text-[#92400E]'
                      }`}
                    >
                      {pendingRepliesCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Filtros Pendentes / Resolvidas */}
              <div
                role="tablist"
                aria-label="Filtrar fila de moderação"
                className="flex flex-wrap items-center gap-2"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={filter === 'pending'}
                  onClick={() => {
                    setConflictBanner(null);
                    setFilter('pending');
                  }}
                  className={`min-h-[44px] inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                    filter === 'pending'
                      ? 'bg-[#0284C7] text-white'
                      : 'border border-[#E2E8F0] bg-white text-[#475569] hover:text-[#0F172A]'
                  }`}
                >
                  <span>Pendentes</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                      filter === 'pending'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-[#0F172A]'
                    }`}
                  >
                    {activePendingCount}
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={filter === 'resolved'}
                  onClick={() => {
                    setConflictBanner(null);
                    setFilter('resolved');
                  }}
                  className={`min-h-[44px] inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                    filter === 'resolved'
                      ? 'bg-[#0284C7] text-white'
                      : 'border border-[#E2E8F0] bg-white text-[#475569] hover:text-[#0F172A]'
                  }`}
                >
                  <span>Resolvidas</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                      filter === 'resolved'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-[#0F172A]'
                    }`}
                  >
                    {activeResolvedCount}
                  </span>
                </button>
              </div>
            </div>

            {/* Lista */}
            {isLoading ? (
              <div className="space-y-4" aria-busy="true">
                {[1, 2].map((n) => (
                  <Card key={n} padding="md">
                    <div className="flex items-center gap-3 py-6 justify-center text-sm text-[#475569]">
                      <Loader2 className="h-5 w-5 animate-spin text-[#0284C7]" aria-hidden="true" />
                      <span>Carregando fila...</span>
                    </div>
                  </Card>
                ))}
              </div>
            ) : loadError && activeItemsLength === 0 ? (
              <ErrorState
                title="Não foi possível carregar a fila"
                description={loadError}
                onRetry={() => void loadQueue(targetKind, filter, 1, false)}
              />
            ) : activeItemsLength === 0 ? (
              <EmptyState
                icon={<ShieldCheck className="h-6 w-6" aria-hidden="true" />}
                title={
                  filter === 'pending'
                    ? targetKind === 'report'
                      ? 'Nenhuma denúncia pendente em relatos'
                      : 'Nenhuma denúncia pendente em respostas'
                    : targetKind === 'report'
                      ? 'Nenhuma revisão resolvida em relatos ainda'
                      : 'Nenhuma revisão resolvida em respostas ainda'
                }
                description={
                  filter === 'pending'
                    ? targetKind === 'report'
                      ? 'Todos os relatos denunciados já foram revisados.'
                      : 'Todas as respostas denunciadas já foram revisadas.'
                    : 'Quando houver decisões de moderação registradas, elas aparecerão aqui.'
                }
              />
            ) : (
              <div className="space-y-4">
                {targetKind === 'report'
                  ? reportItems.map((item) => {
                      const busyKey = `report:${item.reportId}`;
                      const isBusy = pendingDecisionIds.has(busyKey);
                      const isFlagsOpen = expandedFlagsIds.has(busyKey);
                      const isLogsOpen = expandedLogsIds.has(busyKey);
                      const cardError = cardErrorById[busyKey];

                      return (
                        <Card key={item.reportId} padding="md" className="min-w-0 space-y-4">
                          {/* Cabeçalho: autor público, praia, visibilidade e contadores */}
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              {item.authorAvatarUrl ? (
                                <img
                                  src={item.authorAvatarUrl}
                                  alt={item.authorName}
                                  referrerPolicy="no-referrer"
                                  className="h-10 w-10 shrink-0 rounded-full border border-sky-100 object-cover"
                                />
                              ) : (
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-xs font-bold text-[#0284C7] border border-sky-100">
                                  {getInitials(item.authorName)}
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="min-w-0 max-w-full break-words text-sm font-bold text-[#0F172A]">
                                    {item.authorName}
                                  </p>
                                  {item.moderationStatus === 'hidden' ? (
                                    <Badge tone="danger">
                                      <EyeOff className="h-3 w-3" aria-hidden="true" />
                                      Ocultado
                                    </Badge>
                                  ) : (
                                    <Badge tone="success">
                                      <Eye className="h-3 w-3" aria-hidden="true" />
                                      Visível no feed
                                    </Badge>
                                  )}
                                </div>

                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#475569]">
                                  <Link
                                    to={`/praia/${item.beachSlug}`}
                                    className="inline-flex items-center gap-1 font-semibold text-[#0284C7] hover:underline"
                                  >
                                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                                    {item.beachName}
                                  </Link>
                                  <span aria-hidden="true">·</span>
                                  <span className="tabular-nums">
                                    Relato de {formatExactDateTime(item.reportCreatedAt)} (
                                    {formatRelativeTime(item.reportCreatedAt)})
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <span className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-slate-50 px-2 py-1 text-xs font-semibold text-[#475569] tabular-nums">
                                <ThumbsUp className="h-3 w-3" aria-hidden="true" />
                                {item.helpfulCount}
                              </span>
                            </div>
                          </div>

                          {/* Conteúdo do relato */}
                          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 space-y-3">
                            {(() => {
                              const conditionsSummary = formatReportConditionsSummary({
                                postCode: item.postCode,
                                skyCondition: item.skyCondition,
                                seaCondition: item.seaCondition,
                                crowdLevel: item.crowdLevel,
                              });
                              return conditionsSummary ? (
                                <p className="break-words text-xs font-semibold text-[#0F172A]">
                                  {conditionsSummary}
                                </p>
                              ) : null;
                            })()}

                            {item.comment ? (
                              <p className="break-words text-sm leading-relaxed text-[#0F172A]">
                                {item.comment}
                              </p>
                            ) : (
                              <p className="text-xs italic text-[#64748B]">
                                Relato publicado sem comentário em texto.
                              </p>
                            )}

                            {item.photoUrl && (
                              <div>
                                <button
                                  type="button"
                                  onClick={() => setPhotoViewerItem(item)}
                                  aria-label={`Ampliar foto do relato de ${item.authorName}`}
                                  className="group relative block aspect-[4/3] w-full max-w-xs overflow-hidden rounded-xl border border-[#E2E8F0] bg-slate-100 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7]"
                                >
                                  <img
                                    src={item.photoUrl}
                                    alt={`Foto do relato de ${item.authorName} em ${item.beachName}`}
                                    loading="lazy"
                                    className="h-full w-full object-cover object-center"
                                  />
                                  <span className="pointer-events-none absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-lg bg-slate-950/80 px-2 py-1 text-[11px] font-semibold text-white">
                                    <Maximize2 className="h-3 w-3" aria-hidden="true" />
                                    Ampliar
                                  </span>
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Resumo agrupado das denúncias */}
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {item.pendingFlagsCount > 0 && (
                              <Badge tone="warning">
                                <Flag className="h-3 w-3" aria-hidden="true" />
                                {item.pendingFlagsCount}{' '}
                                {item.pendingFlagsCount === 1 ? 'pendente' : 'pendentes'}
                              </Badge>
                            )}
                            <span className="font-semibold text-[#334155] tabular-nums">
                              Total: {item.totalFlagsCount}{' '}
                              {item.totalFlagsCount === 1 ? 'denúncia' : 'denúncias'}
                            </span>
                            {item.latestFlagAt && (
                              <span className="text-[#475569] tabular-nums">
                                · Última em {formatExactDateTime(item.latestFlagAt)}
                              </span>
                            )}
                          </div>

                          {item.reasonSummary.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {item.reasonSummary.map((summary) => (
                                <span
                                  key={summary.reason}
                                  className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-medium text-[#334155]"
                                >
                                  <span>{getFlagReasonLabel(summary.reason)}</span>
                                  <span className="font-bold text-[#0F172A] tabular-nums">
                                    ({summary.count})
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Acordeões: denúncias relacionadas e histórico */}
                          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                            <button
                              type="button"
                              onClick={() => toggleFlagsExpanded(busyKey)}
                              aria-expanded={isFlagsOpen}
                              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors"
                            >
                              <Flag className="h-3.5 w-3.5 text-[#92400E]" aria-hidden="true" />
                              <span>Denúncias ({item.flags.length})</span>
                              {isFlagsOpen ? (
                                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleLogsExpanded(busyKey)}
                              aria-expanded={isLogsOpen}
                              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors"
                            >
                              <History className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
                              <span>Histórico ({item.logs.length})</span>
                              {isLogsOpen ? (
                                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                            </button>
                          </div>

                          {isFlagsOpen && (
                            <div className="space-y-2 rounded-xl border border-[#E2E8F0] bg-slate-50/70 p-3">
                              {item.flags.length === 0 ? (
                                <p className="text-xs text-[#64748B]">
                                  Nenhuma denúncia registrada para este relato.
                                </p>
                              ) : (
                                item.flags.map((flag) => (
                                  <div
                                    key={flag.id}
                                    className="rounded-lg border border-[#E2E8F0] bg-white p-2.5 text-xs space-y-1"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                                      <span className="font-bold text-[#0F172A]">
                                        {getFlagReasonLabel(flag.reason)}
                                      </span>
                                      <span className="text-[11px] font-semibold text-[#475569]">
                                        {getFlagStatusLabel(flag.status)}
                                      </span>
                                    </div>
                                    {flag.details && (
                                      <p className="break-words text-[#334155] leading-relaxed">
                                        “{flag.details}”
                                      </p>
                                    )}
                                    <p className="text-[11px] text-[#64748B] tabular-nums">
                                      Denunciado por {flag.reporterName} em{' '}
                                      {formatExactDateTime(flag.createdAt)}
                                    </p>
                                  </div>
                                ))
                              )}
                            </div>
                          )}

                          {isLogsOpen && (
                            <div className="space-y-2 rounded-xl border border-[#E2E8F0] bg-slate-50/70 p-3">
                              {item.logs.length === 0 ? (
                                <p className="text-xs text-[#64748B]">
                                  Ainda não há decisões administrativas registradas para este relato.
                                </p>
                              ) : (
                                item.logs.map((log) => (
                                  <div
                                    key={log.id}
                                    className="rounded-lg border border-[#E2E8F0] bg-white p-2.5 text-xs space-y-1"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                                      <span className="font-bold text-[#0F172A]">
                                        {getModerationActionLabel(log.action)}
                                      </span>
                                      <span className="text-[11px] text-[#64748B] tabular-nums">
                                        {formatExactDateTime(log.createdAt)}
                                      </span>
                                    </div>
                                    {log.reason && (
                                      <p className="break-words text-[#334155]">
                                        Justificativa: {log.reason}
                                      </p>
                                    )}
                                    <p className="text-[11px] text-[#64748B]">
                                      Responsável: {log.moderatorName} · {log.flagsResolvedCount}{' '}
                                      {log.flagsResolvedCount === 1
                                        ? 'denúncia encerrada'
                                        : 'denúncias encerradas'}
                                    </p>
                                  </div>
                                ))
                              )}
                            </div>
                          )}

                          {cardError && (
                            <div
                              role="alert"
                              className="flex items-start gap-2 rounded-xl border border-[#EF4444]/30 bg-[#FEE2E2] px-3 py-2 text-xs font-medium text-[#991B1B]"
                            >
                              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                              <span className="min-w-0 break-words">{cardError}</span>
                            </div>
                          )}

                          {/* Ações administrativas */}
                          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                            {item.moderationStatus === 'visible' ? (
                              <>
                                {item.pendingFlagsCount > 0 && (
                                  <Button
                                    variant="secondary"
                                    size="md"
                                    loading={isBusy}
                                    disabled={isBusy}
                                    onClick={() => void handleKeepReportVisible(item)}
                                  >
                                    <CheckCircle2 className="h-4 w-4 text-[#166534]" aria-hidden="true" />
                                    Manter publicação
                                  </Button>
                                )}

                                <Button
                                  variant="danger"
                                  size="md"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setDecisionModalError(null);
                                    setDecisionModalState({
                                      kind: 'report',
                                      action: 'hide',
                                      item,
                                    });
                                  }}
                                >
                                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                                  Ocultar publicação
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="primary"
                                size="md"
                                disabled={isBusy}
                                onClick={() => {
                                  setDecisionModalError(null);
                                  setDecisionModalState({
                                    kind: 'report',
                                    action: 'restore',
                                    item,
                                  });
                                }}
                              >
                                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                Restaurar publicação
                              </Button>
                            )}
                          </div>
                        </Card>
                      );
                    })
                  : replyItems.map((item) => {
                      const busyKey = `reply:${item.replyId}`;
                      const isBusy = pendingDecisionIds.has(busyKey);
                      const isFlagsOpen = expandedFlagsIds.has(busyKey);
                      const isLogsOpen = expandedLogsIds.has(busyKey);
                      const cardError = cardErrorById[busyKey];

                      return (
                        <Card key={item.replyId} padding="md" className="min-w-0 space-y-4">
                          {/* Cabeçalho da resposta denunciada */}
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              {item.authorAvatarUrl ? (
                                <img
                                  src={item.authorAvatarUrl}
                                  alt={item.authorName}
                                  referrerPolicy="no-referrer"
                                  className="h-10 w-10 shrink-0 rounded-full border border-sky-100 object-cover"
                                />
                              ) : (
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-xs font-bold text-[#0284C7] border border-sky-100">
                                  {getInitials(item.authorName)}
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="min-w-0 max-w-full break-words text-sm font-bold text-[#0F172A]">
                                    {item.authorName}
                                  </p>
                                  {item.authorUsername && (
                                    <Link
                                      to={`/u/${encodeURIComponent(item.authorUsername)}`}
                                      className="text-xs font-medium text-[#475569] hover:text-[#0284C7] hover:underline"
                                    >
                                      @{item.authorUsername}
                                    </Link>
                                  )}
                                  {item.moderationStatus === 'hidden' ? (
                                    <Badge tone="danger">
                                      <EyeOff className="h-3 w-3" aria-hidden="true" />
                                      Resposta ocultada
                                    </Badge>
                                  ) : (
                                    <Badge tone="success">
                                      <Eye className="h-3 w-3" aria-hidden="true" />
                                      Visível na conversa
                                    </Badge>
                                  )}
                                </div>

                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#475569]">
                                  <Link
                                    to={`/praia/${item.beachSlug}`}
                                    className="inline-flex items-center gap-1 font-semibold text-[#0284C7] hover:underline"
                                  >
                                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                                    {item.beachName}
                                  </Link>
                                  <span aria-hidden="true">·</span>
                                  <span className="tabular-nums">
                                    Resposta de {formatExactDateTime(item.replyCreatedAt)} (
                                    {formatRelativeTime(item.replyCreatedAt)})
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Texto puro da resposta + contexto resumido do relato pai */}
                          <div className="space-y-2.5">
                            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
                              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#0F172A]">
                                {item.body}
                              </p>
                            </div>

                            <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-white px-3.5 py-2.5 text-xs text-[#475569] space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-[#0F172A]">
                                  Contexto do relato pai (de {item.reportAuthorName})
                                </span>
                                {item.reportModerationStatus === 'hidden' && (
                                  <Badge tone="warning">Relato pai ocultado</Badge>
                                )}
                              </div>
                              {item.reportComment ? (
                                <p className="line-clamp-2 break-words">
                                  “{item.reportComment}”
                                </p>
                              ) : (
                                <p className="italic">
                                  Relato pai publicado sem comentário em texto.
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Resumo agrupado das denúncias */}
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {item.pendingFlagsCount > 0 && (
                              <Badge tone="warning">
                                <Flag className="h-3 w-3" aria-hidden="true" />
                                {item.pendingFlagsCount}{' '}
                                {item.pendingFlagsCount === 1 ? 'pendente' : 'pendentes'}
                              </Badge>
                            )}
                            <span className="font-semibold text-[#334155] tabular-nums">
                              Total: {item.totalFlagsCount}{' '}
                              {item.totalFlagsCount === 1 ? 'denúncia' : 'denúncias'}
                            </span>
                            {item.latestFlagAt && (
                              <span className="text-[#475569] tabular-nums">
                                · Última em {formatExactDateTime(item.latestFlagAt)}
                              </span>
                            )}
                          </div>

                          {item.reasonSummary.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {item.reasonSummary.map((summary) => (
                                <span
                                  key={summary.reason}
                                  className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-medium text-[#334155]"
                                >
                                  <span>{getFlagReasonLabel(summary.reason)}</span>
                                  <span className="font-bold text-[#0F172A] tabular-nums">
                                    ({summary.count})
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Acordeões: denúncias relacionadas e histórico */}
                          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                            <button
                              type="button"
                              onClick={() => toggleFlagsExpanded(busyKey)}
                              aria-expanded={isFlagsOpen}
                              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors"
                            >
                              <Flag className="h-3.5 w-3.5 text-[#92400E]" aria-hidden="true" />
                              <span>Denúncias ({item.flags.length})</span>
                              {isFlagsOpen ? (
                                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleLogsExpanded(busyKey)}
                              aria-expanded={isLogsOpen}
                              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3 text-xs font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors"
                            >
                              <History className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
                              <span>Histórico ({item.logs.length})</span>
                              {isLogsOpen ? (
                                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                            </button>
                          </div>

                          {isFlagsOpen && (
                            <div className="space-y-2 rounded-xl border border-[#E2E8F0] bg-slate-50/70 p-3">
                              {item.flags.length === 0 ? (
                                <p className="text-xs text-[#64748B]">
                                  Nenhuma denúncia registrada para esta resposta.
                                </p>
                              ) : (
                                item.flags.map((flag) => (
                                  <div
                                    key={flag.id}
                                    className="rounded-lg border border-[#E2E8F0] bg-white p-2.5 text-xs space-y-1"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                                      <span className="font-bold text-[#0F172A]">
                                        {getFlagReasonLabel(flag.reason)}
                                      </span>
                                      <span className="text-[11px] font-semibold text-[#475569]">
                                        {getFlagStatusLabel(flag.status)}
                                      </span>
                                    </div>
                                    {flag.details && (
                                      <p className="break-words text-[#334155] leading-relaxed">
                                        “{flag.details}”
                                      </p>
                                    )}
                                    <p className="text-[11px] text-[#64748B] tabular-nums">
                                      Denunciado por {flag.reporterName} em{' '}
                                      {formatExactDateTime(flag.createdAt)}
                                    </p>
                                  </div>
                                ))
                              )}
                            </div>
                          )}

                          {isLogsOpen && (
                            <div className="space-y-2 rounded-xl border border-[#E2E8F0] bg-slate-50/70 p-3">
                              {item.logs.length === 0 ? (
                                <p className="text-xs text-[#64748B]">
                                  Ainda não há decisões administrativas registradas para esta resposta.
                                </p>
                              ) : (
                                item.logs.map((log) => (
                                  <div
                                    key={log.id}
                                    className="rounded-lg border border-[#E2E8F0] bg-white p-2.5 text-xs space-y-1"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                                      <span className="font-bold text-[#0F172A]">
                                        {getModerationActionLabel(log.action)}
                                      </span>
                                      <span className="text-[11px] text-[#64748B] tabular-nums">
                                        {formatExactDateTime(log.createdAt)}
                                      </span>
                                    </div>
                                    {log.reason && (
                                      <p className="break-words text-[#334155]">
                                        Justificativa: {log.reason}
                                      </p>
                                    )}
                                    <p className="text-[11px] text-[#64748B]">
                                      Responsável: {log.moderatorName} · {log.flagsResolvedCount}{' '}
                                      {log.flagsResolvedCount === 1
                                        ? 'denúncia encerrada'
                                        : 'denúncias encerradas'}
                                    </p>
                                  </div>
                                ))
                              )}
                            </div>
                          )}

                          {cardError && (
                            <div
                              role="alert"
                              className="flex items-start gap-2 rounded-xl border border-[#EF4444]/30 bg-[#FEE2E2] px-3 py-2 text-xs font-medium text-[#991B1B]"
                            >
                              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                              <span className="min-w-0 break-words">{cardError}</span>
                            </div>
                          )}

                          {/* Ações administrativas */}
                          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                            {item.moderationStatus === 'visible' ? (
                              <>
                                {item.pendingFlagsCount > 0 && (
                                  <Button
                                    variant="secondary"
                                    size="md"
                                    loading={isBusy}
                                    disabled={isBusy}
                                    onClick={() => void handleKeepReplyVisible(item)}
                                  >
                                    <CheckCircle2 className="h-4 w-4 text-[#166534]" aria-hidden="true" />
                                    Manter resposta
                                  </Button>
                                )}

                                <Button
                                  variant="danger"
                                  size="md"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setDecisionModalError(null);
                                    setDecisionModalState({
                                      kind: 'reply',
                                      action: 'hide',
                                      item,
                                    });
                                  }}
                                >
                                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                                  Ocultar resposta
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="primary"
                                size="md"
                                disabled={isBusy}
                                onClick={() => {
                                  setDecisionModalError(null);
                                  setDecisionModalState({
                                    kind: 'reply',
                                    action: 'restore',
                                    item,
                                  });
                                }}
                              >
                                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                Restaurar resposta
                              </Button>
                            )}
                          </div>
                        </Card>
                      );
                    })}

                {loadError && (
                  <p className="text-center text-xs font-medium text-[#991B1B]">
                    {loadError}
                  </p>
                )}

                {activeHasMore && (
                  <div className="flex justify-center pt-1">
                    <Button
                      variant="secondary"
                      loading={isLoadingMore}
                      disabled={isLoadingMore}
                      onClick={() =>
                        void loadQueue(targetKind, filter, activePage + 1, true)
                      }
                    >
                      {isLoadingMore ? 'Carregando...' : 'Carregar mais'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <ModerationDecisionModal
          open={decisionModalState !== null}
          action={decisionModalState?.action ?? 'hide'}
          targetKind={decisionModalState?.kind ?? 'report'}
          targetId={
            decisionModalState
              ? decisionModalState.kind === 'report'
                ? decisionModalState.item.reportId
                : decisionModalState.item.replyId
              : null
          }
          targetSummary={
            decisionModalState
              ? decisionModalState.kind === 'report'
                ? `Relato de ${decisionModalState.item.authorName} em ${decisionModalState.item.beachName}`
                : `Resposta de ${decisionModalState.item.authorName} em ${decisionModalState.item.beachName}`
              : ''
          }
          hasPhotoWarning={
            decisionModalState?.kind === 'report'
              ? Boolean(decisionModalState.item.photoUrl)
              : false
          }
          isSubmitting={modalBusyKey ? pendingDecisionIds.has(modalBusyKey) : false}
          errorMessage={decisionModalError}
          onConfirm={handleConfirmModalDecision}
          onClose={() => {
            if (modalBusyKey && pendingDecisionIds.has(modalBusyKey)) {
              return;
            }
            setDecisionModalError(null);
            setDecisionModalState(null);
          }}
        />

        {photoViewerItem?.photoUrl && (
          <ReportPhotoViewerModal
            open
            photoUrl={photoViewerItem.photoUrl}
            alt={`Foto do relato de ${photoViewerItem.authorName} em ${photoViewerItem.beachName}`}
            authorName={photoViewerItem.authorName}
            beachName={photoViewerItem.beachName}
            onClose={() => setPhotoViewerItem(null)}
          />
        )}
      </div>
    </AppLayout>
  );
}
