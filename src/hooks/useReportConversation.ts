import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import * as reportsService from '../services/reports';
import type { BeachReport } from '../types';

const CONVERSATION_PARAM = 'conversa';
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface UseReportConversationParams {
  authReady: boolean;
  items: BeachReport[];
  setItems: Dispatch<SetStateAction<BeachReport[]>>;
  baseReturnTo?: string;
}

export function useReportConversation({
  authReady,
  items,
  setItems,
  baseReturnTo,
}: UseReportConversationParams) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeReport, setActiveReport] = useState<BeachReport | null>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const resolvedParamReportIdRef = useRef<string | null>(null);
  const fetchRequestIdRef = useRef(0);

  const rawConversaId = searchParams.get(CONVERSATION_PARAM)?.trim() ?? '';
  const validConversaId = UUID_REGEX.test(rawConversaId) ? rawConversaId : '';

  const clearConversaParam = useCallback(() => {
    if (!searchParams.has(CONVERSATION_PARAM)) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete(CONVERSATION_PARAM);
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!authReady) return;

    if (!validConversaId) {
      resolvedParamReportIdRef.current = null;
      return;
    }

    if (
      resolvedParamReportIdRef.current === validConversaId ||
      activeReport?.id === validConversaId
    ) {
      return;
    }

    const fromList = itemsRef.current.find(
      (item) =>
        item.id === validConversaId && item.moderationStatus !== 'hidden'
    );

    if (fromList) {
      resolvedParamReportIdRef.current = validConversaId;
      setActiveReport(fromList);
      return;
    }

    const requestId = ++fetchRequestIdRef.current;
    let cancelled = false;

    void reportsService
      .getVisibleReportById(validConversaId)
      .then((fetched) => {
        if (cancelled || requestId !== fetchRequestIdRef.current) return;
        resolvedParamReportIdRef.current = validConversaId;
        if (fetched && fetched.moderationStatus !== 'hidden') {
          setActiveReport(fetched);
        } else {
          clearConversaParam();
        }
      })
      .catch(() => {
        if (cancelled || requestId !== fetchRequestIdRef.current) return;
        resolvedParamReportIdRef.current = validConversaId;
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, validConversaId, activeReport?.id, items.length, clearConversaParam]);

  const openConversation = useCallback((report: BeachReport) => {
    if (report.moderationStatus === 'hidden') return;
    setActiveReport(report);
  }, []);

  const closeConversation = useCallback(() => {
    fetchRequestIdRef.current += 1;
    setActiveReport(null);
    resolvedParamReportIdRef.current = null;
    clearConversaParam();
  }, [clearConversaParam]);

  const handleReplyCountChange = useCallback(
    (reportId: string, nextCount: number) => {
      const normalized = Math.max(0, Math.round(nextCount));
      setItems((prev) =>
        prev.map((item) =>
          item.id === reportId
            ? { ...item, replyCount: normalized, replyLoadError: false }
            : item
        )
      );
      setActiveReport((prev) =>
        prev && prev.id === reportId
          ? { ...prev, replyCount: normalized, replyLoadError: false }
          : prev
      );
    },
    [setItems]
  );

  const getConversationReturnTo = useCallback(
    (reportId: string) => {
      const basePath = baseReturnTo ?? `${location.pathname}${location.search}`;
      try {
        const parsed = new URL(basePath, 'https://praiou.local');
        parsed.searchParams.set(CONVERSATION_PARAM, reportId);
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      } catch {
        return `${location.pathname}?${CONVERSATION_PARAM}=${encodeURIComponent(reportId)}`;
      }
    },
    [baseReturnTo, location.pathname, location.search]
  );

  return {
    activeReport,
    openConversation,
    closeConversation,
    handleReplyCountChange,
    getConversationReturnTo,
  };
}
