import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { BeachReport } from '../types';
import { setPendingAuthReturnPath } from '../utils/authRedirect';

interface UseReportFlagActionsParams {
  userId: string | null;
  setItems: Dispatch<SetStateAction<BeachReport[]>>;
  returnTo: string;
}

export function useReportFlagActions({
  userId,
  setItems,
  returnTo,
}: UseReportFlagActionsParams) {
  const navigate = useNavigate();
  const [flagTargetReport, setFlagTargetReport] = useState<BeachReport | null>(null);
  const currentUserIdRef = useRef<string | null>(userId);
  currentUserIdRef.current = userId;

  // Fecha modal de denúncia ao deslogar ou trocar de conta
  useEffect(() => {
    setFlagTargetReport(null);
  }, [userId]);

  const handleOpenFlagModal = useCallback(
    (report: BeachReport) => {
      const actorId = currentUserIdRef.current;

      if (!actorId) {
        setPendingAuthReturnPath(returnTo, '/perfil');
        navigate('/entrar', { state: { returnTo } });
        return;
      }

      if (report.userId === actorId || report.moderationStatus === 'hidden') {
        return;
      }

      setFlagTargetReport(report);
    },
    [navigate, returnTo]
  );

  const handleCloseFlagModal = useCallback(() => {
    setFlagTargetReport(null);
  }, []);

  const handleFlagSuccess = useCallback(
    (reportId: string) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === reportId
            ? { ...item, viewerHasFlagged: true }
            : item
        )
      );
      setFlagTargetReport((prev) =>
        prev && prev.id === reportId
          ? { ...prev, viewerHasFlagged: true }
          : prev
      );
    },
    [setItems]
  );

  return {
    flagTargetReport,
    handleOpenFlagModal,
    handleCloseFlagModal,
    handleFlagSuccess,
  };
}
