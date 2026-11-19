import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useNavigate } from 'react-router-dom';
import * as reportsService from '../services/reports';
import type { BeachReport } from '../types';
import { setPendingAuthReturnPath } from '../utils/authRedirect';

interface UseReportHelpfulActionsParams {
  userId: string | null;
  authReady: boolean;
  items: BeachReport[];
  setItems: Dispatch<SetStateAction<BeachReport[]>>;
  returnTo: string;
}

export function useReportHelpfulActions({
  userId,
  authReady,
  items,
  setItems,
  returnTo,
}: UseReportHelpfulActionsParams) {
  const navigate = useNavigate();

  const [pendingHelpfulIds, setPendingHelpfulIds] = useState<Set<string>>(
    () => new Set()
  );
  const [helpfulErrorById, setHelpfulErrorById] = useState<Record<string, string>>({});
  const [isRetryingHelpful, setIsRetryingHelpful] = useState(false);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const currentUserIdRef = useRef<string | null>(userId);
  currentUserIdRef.current = userId;

  const pendingSetRef = useRef<Set<string>>(new Set());
  const reactionSeqByIdRef = useRef<Record<string, number>>({});
  const revalidateRequestIdRef = useRef(0);
  const previousSyncedUserIdRef = useRef<string | null | undefined>(undefined);

  const hasHelpfulLoadError = items.some((r) => r.helpfulLoadError);

  const applySummaryToItem = useCallback(
    (summary: reportsService.HelpfulReactionSummary) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === summary.reportId
            ? {
                ...item,
                helpfulCount: summary.helpfulCount,
                viewerHasReacted: summary.viewerHasReacted,
                helpfulLoadError: false,
              }
            : item
        )
      );
    },
    [setItems]
  );

  const revalidateHelpfulSummaries = useCallback(
    async (explicitIds?: string[]) => {
      const targetIds = Array.from(
        new Set(
          (explicitIds ?? itemsRef.current.map((item) => item.id)).filter(Boolean)
        )
      );

      if (targetIds.length === 0) {
        return;
      }

      const requestId = ++revalidateRequestIdRef.current;
      const capturedUserId = currentUserIdRef.current;
      const seqSnapshot: Record<string, number> = {};
      for (const id of targetIds) {
        seqSnapshot[id] = reactionSeqByIdRef.current[id] ?? 0;
      }

      setIsRetryingHelpful(true);

      try {
        const summaries = await reportsService.getReportHelpfulSummaries(targetIds);

        if (
          requestId !== revalidateRequestIdRef.current ||
          currentUserIdRef.current !== capturedUserId
        ) {
          return;
        }

        const targetSet = new Set(targetIds);
        setItems((prev) =>
          prev.map((item) => {
            if (!targetSet.has(item.id)) return item;
            if ((reactionSeqByIdRef.current[item.id] ?? 0) !== seqSnapshot[item.id]) {
              return item;
            }
            const summary = summaries.get(item.id);
            return {
              ...item,
              helpfulCount: summary?.helpfulCount ?? 0,
              viewerHasReacted:
                capturedUserId !== null
                  ? (summary?.viewerHasReacted ?? false)
                  : false,
              helpfulLoadError: false,
            };
          })
        );
      } catch {
        if (
          requestId !== revalidateRequestIdRef.current ||
          currentUserIdRef.current !== capturedUserId
        ) {
          return;
        }

        const targetSet = new Set(targetIds);
        setItems((prev) =>
          prev.map((item) => {
            if (!targetSet.has(item.id)) return item;
            if ((reactionSeqByIdRef.current[item.id] ?? 0) !== seqSnapshot[item.id]) {
              return item;
            }
            return {
              ...item,
              helpfulCount: null,
              viewerHasReacted: false,
              helpfulLoadError: true,
            };
          })
        );
      } finally {
        if (requestId === revalidateRequestIdRef.current) {
          setIsRetryingHelpful(false);
        }
      }
    },
    [setItems]
  );

  // Limpa ou revalida estados específicos do usuário após login, troca de conta ou logout
  useEffect(() => {
    if (!authReady) return;

    const prevUser = previousSyncedUserIdRef.current;
    previousSyncedUserIdRef.current = userId;

    if (prevUser === undefined) {
      // Primeira estabilização de authReady: só revalida se houver usuário logado e itens carregados antes da sessão
      if (userId !== null && itemsRef.current.length > 0) {
        void revalidateHelpfulSummaries();
      }
      return;
    }

    if (prevUser === userId) {
      return;
    }

    // Troca de conta ou logout: invalida mutações pendentes e limpa viewerHasReacted imediatamente
    revalidateRequestIdRef.current += 1;
    pendingSetRef.current = new Set();
    setPendingHelpfulIds(new Set());
    setHelpfulErrorById({});

    for (const item of itemsRef.current) {
      reactionSeqByIdRef.current[item.id] =
        (reactionSeqByIdRef.current[item.id] ?? 0) + 1;
    }

    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        viewerHasReacted: false,
      }))
    );

    if (itemsRef.current.length > 0) {
      void revalidateHelpfulSummaries();
    }
  }, [authReady, userId, revalidateHelpfulSummaries, setItems]);

  const handleToggleHelpful = useCallback(
    async (report: BeachReport) => {
      const actorUserId = currentUserIdRef.current;

      if (!actorUserId) {
        setPendingAuthReturnPath(returnTo, '/perfil');
        navigate('/entrar', { state: { returnTo } });
        return;
      }

      if (report.userId === actorUserId) {
        return;
      }

      if (pendingSetRef.current.has(report.id)) {
        return;
      }

      pendingSetRef.current.add(report.id);
      setPendingHelpfulIds(new Set(pendingSetRef.current));
      setHelpfulErrorById((prev) => {
        if (!(report.id in prev)) return prev;
        const next = { ...prev };
        delete next[report.id];
        return next;
      });

      const mutationSeq = (reactionSeqByIdRef.current[report.id] ?? 0) + 1;
      reactionSeqByIdRef.current[report.id] = mutationSeq;

      const currentlyReacted = Boolean(report.viewerHasReacted);

      try {
        const confirmed = currentlyReacted
          ? await reportsService.unmarkReportHelpful(report.id)
          : await reportsService.markReportHelpful(report.id);

        if (
          currentUserIdRef.current !== actorUserId ||
          reactionSeqByIdRef.current[report.id] !== mutationSeq
        ) {
          return;
        }

        applySummaryToItem(confirmed);
      } catch (err) {
        if (
          currentUserIdRef.current !== actorUserId ||
          reactionSeqByIdRef.current[report.id] !== mutationSeq
        ) {
          return;
        }

        if (
          err instanceof reportsService.HelpfulReactionMutationError &&
          err.reconciled
        ) {
          applySummaryToItem(err.reconciled);
        }

        const message =
          err instanceof Error
            ? err.message
            : 'Não foi possível atualizar sua marcação agora. Tente novamente.';

        setHelpfulErrorById((prev) => ({
          ...prev,
          [report.id]: message,
        }));
      } finally {
        pendingSetRef.current.delete(report.id);
        setPendingHelpfulIds(new Set(pendingSetRef.current));
      }
    },
    [applySummaryToItem, navigate, returnTo]
  );

  const dismissHelpfulError = useCallback((reportId: string) => {
    setHelpfulErrorById((prev) => {
      if (!(reportId in prev)) return prev;
      const next = { ...prev };
      delete next[reportId];
      return next;
    });
  }, []);

  return {
    pendingHelpfulIds,
    helpfulErrorById,
    hasHelpfulLoadError,
    isRetryingHelpful,
    handleToggleHelpful,
    dismissHelpfulError,
    retryHelpfulSummaries: () => revalidateHelpfulSummaries(),
  };
}
