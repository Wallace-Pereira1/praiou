import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  EyeOff,
  Flag,
  Loader2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  MAX_FLAG_DETAILS_LENGTH,
  REPORT_FLAG_REASONS,
  ReportFlagError,
  submitReplyFlag,
} from '../../services/moderation';
import {
  DEFAULT_REPLIES_PAGE_SIZE,
  MAX_REPLY_LENGTH,
  ReplyPublishError,
  clearReplyDraft,
  createReportReply,
  deleteReportReply,
  getRepliesByReport,
  getReplyDraft,
  saveReplyDraft,
} from '../../services/replies';
import type {
  BeachReport,
  BeachReportReply,
  ReportFlagReason,
} from '../../types';
import { setPendingAuthReturnPath } from '../../utils/authRedirect';
import { formatRelativeTime, getInitials } from '../../utils/formatters';
import { generateReportUuid } from '../../utils/reportImage';
import { Button } from '../ui/Button';
import { SunRatingDisplay } from '../ui/StarRating';

interface ReportRepliesModalProps {
  report: BeachReport | null;
  returnTo: string;
  onClose: () => void;
  onReplyCountChange?: (reportId: string, nextCount: number) => void;
}

export function ReportRepliesModal({
  report,
  returnTo,
  onClose,
  onReplyCountChange,
}: ReportRepliesModalProps) {
  const navigate = useNavigate();
  const { user, authReady } = useApp();

  const [loadedReplies, setLoadedReplies] = useState<BeachReportReply[]>([]);
  const [recentTailReplies, setRecentTailReplies] = useState<BeachReportReply[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [publicReplyCount, setPublicReplyCount] = useState<number>(0);

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draftBody, setDraftBody] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const [confirmDeleteReplyId, setConfirmDeleteReplyId] = useState<string | null>(
    null
  );
  const [deletingReplyId, setDeletingReplyId] = useState<string | null>(null);
  const [deleteErrorByReplyId, setDeleteErrorByReplyId] = useState<
    Record<string, string>
  >({});

  const [openMenuReplyId, setOpenMenuReplyId] = useState<string | null>(null);
  const [flagTargetReply, setFlagTargetReply] = useState<BeachReportReply | null>(
    null
  );
  const [flagReason, setFlagReason] = useState<ReportFlagReason | null>(null);
  const [flagDetails, setFlagDetails] = useState('');
  const [flagError, setFlagError] = useState<string | null>(null);
  const [isFlagSubmitting, setIsFlagSubmitting] = useState(false);

  const loadRequestIdRef = useRef(0);
  const deletedReplyIdsRef = useRef<Set<string>>(new Set());
  const isSubmittingRef = useRef(false);
  const pendingReplyIdRef = useRef<string | null>(null);
  const lastDraftBodyForAttemptRef = useRef<string>('');
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const reportId = report?.id ?? null;

  const loadReplies = useCallback(
    async (targetReportId: string, offset: number, append: boolean) => {
      const requestId = ++loadRequestIdRef.current;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setLoadError(null);

      try {
        const result = await getRepliesByReport(targetReportId, {
          offset,
          pageSize: DEFAULT_REPLIES_PAGE_SIZE,
        });

        if (requestId !== loadRequestIdRef.current) {
          return;
        }

        const filtered = result.items.filter(
          (item) => !deletedReplyIdsRef.current.has(item.id)
        );

        setHasMore(result.hasMore);

        if (append) {
          setLoadedReplies((prev) => {
            const seen = new Set(prev.map((item) => item.id));
            const next = filtered.filter((item) => !seen.has(item.id));
            const merged = [...prev, ...next];
            const mergedIds = new Set(merged.map((item) => item.id));
            setRecentTailReplies((tailPrev) =>
              tailPrev.filter((item) => !mergedIds.has(item.id))
            );
            return merged;
          });
        } else {
          setLoadedReplies(filtered);
          const loadedIds = new Set(filtered.map((item) => item.id));
          setRecentTailReplies((tailPrev) =>
            tailPrev.filter((item) => !loadedIds.has(item.id))
          );
          setPublicReplyCount(result.visibleCount);
          onReplyCountChange?.(targetReportId, result.visibleCount);
        }
      } catch (err) {
        if (requestId !== loadRequestIdRef.current) {
          return;
        }
        if (!append) {
          setLoadedReplies([]);
        }
        setLoadError(
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar as respostas agora.'
        );
      } finally {
        if (requestId === loadRequestIdRef.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [onReplyCountChange]
  );

  // Reinicia e carrega conversa ao abrir/trocar de relato ou mudar usuário autenticado
  useEffect(() => {
    if (!reportId || !authReady) {
      return;
    }

    deletedReplyIdsRef.current = new Set();
    pendingReplyIdRef.current = null;
    lastDraftBodyForAttemptRef.current = '';
    setLoadedReplies([]);
    setRecentTailReplies([]);
    setHasMore(false);
    setPublicReplyCount(
      typeof report?.replyCount === 'number' ? report.replyCount : 0
    );
    setLoadError(null);
    setSubmitError(null);
    setStatusBanner(null);
    setConfirmDeleteReplyId(null);
    setDeletingReplyId(null);
    setDeleteErrorByReplyId({});
    setOpenMenuReplyId(null);
    setFlagTargetReply(null);
    setFlagReason(null);
    setFlagDetails('');
    setFlagError(null);

    const savedDraft = getReplyDraft(reportId);
    setDraftBody(savedDraft);

    void loadReplies(reportId, 0, false);
  }, [reportId, authReady, user?.id, loadReplies]);

  // Foco inicial e trava de Escape sem empilhar modais
  useEffect(() => {
    if (!reportId) return;

    const timer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;

      if (openMenuReplyId) {
        e.preventDefault();
        setOpenMenuReplyId(null);
        return;
      }

      if (flagTargetReply) {
        if (!isFlagSubmitting) {
          e.preventDefault();
          setFlagTargetReply(null);
          setFlagError(null);
        }
        return;
      }

      if (!isSubmitting && !deletingReplyId) {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    reportId,
    openMenuReplyId,
    flagTargetReply,
    isFlagSubmitting,
    isSubmitting,
    deletingReplyId,
    onClose,
  ]);

  // Fecha menu de opções da resposta ao clicar fora
  useEffect(() => {
    if (!openMenuReplyId) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-reply-menu-root="true"]')) {
        return;
      }
      setOpenMenuReplyId(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [openMenuReplyId]);

  if (!report) return null;

  const trimmedDraft = draftBody.trim();
  const isBusyClosing = isSubmitting || isFlagSubmitting || deletingReplyId !== null;

  const handleDraftChange = (nextValue: string) => {
    const sliced = nextValue.slice(0, MAX_REPLY_LENGTH);
    setDraftBody(sliced);
    saveReplyDraft(report.id, sliced);
    if (submitError) {
      setSubmitError(null);
    }
    if (sliced.trim() !== lastDraftBodyForAttemptRef.current) {
      pendingReplyIdRef.current = null;
    }
  };

  const redirectToLoginWithReturn = () => {
    saveReplyDraft(report.id, draftBody);
    setPendingAuthReturnPath(returnTo, '/feed');
    onClose();
    navigate('/entrar', { state: { returnTo } });
  };

  const handleSubmitReply = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;

    if (!user) {
      redirectToLoginWithReturn();
      return;
    }

    if (trimmedDraft.length === 0) {
      setSubmitError('Escreva uma resposta antes de enviar.');
      composerRef.current?.focus();
      return;
    }

    if (trimmedDraft.length > MAX_REPLY_LENGTH) {
      setSubmitError(`A resposta deve ter no máximo ${MAX_REPLY_LENGTH} caracteres.`);
      return;
    }

    const attemptReplyId =
      pendingReplyIdRef.current &&
      lastDraftBodyForAttemptRef.current === trimmedDraft
        ? pendingReplyIdRef.current
        : generateReportUuid();

    pendingReplyIdRef.current = attemptReplyId;
    lastDraftBodyForAttemptRef.current = trimmedDraft;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    setStatusBanner(null);

    try {
      const created = await createReportReply({
        reportId: report.id,
        body: trimmedDraft,
        replyId: attemptReplyId,
        fallbackAuthor: {
          userName: user.name,
          userUsername: user.username,
          userAvatarUrl: user.avatarUrl,
        },
      });

      pendingReplyIdRef.current = null;
      lastDraftBodyForAttemptRef.current = '';
      clearReplyDraft(report.id);
      setDraftBody('');

      const alreadyShown =
        loadedReplies.some((item) => item.id === created.id) ||
        recentTailReplies.some((item) => item.id === created.id);

      if (!alreadyShown) {
        if (!hasMore) {
          setLoadedReplies((prev) => [...prev, created]);
        } else {
          setRecentTailReplies((prev) => [...prev, created]);
        }
        const nextCount = publicReplyCount + 1;
        setPublicReplyCount(nextCount);
        onReplyCountChange?.(report.id, nextCount);
      }

      setStatusBanner('Resposta publicada!');
    } catch (err) {
      if (!(err instanceof ReplyPublishError && err.ambiguous)) {
        pendingReplyIdRef.current = null;
        lastDraftBodyForAttemptRef.current = '';
      }
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Não foi possível enviar sua resposta agora. Tente novamente.'
      );
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleConfirmDeleteReply = async (reply: BeachReportReply) => {
    if (deletingReplyId) return;
    setDeletingReplyId(reply.id);
    setDeleteErrorByReplyId((prev) => {
      if (!(reply.id in prev)) return prev;
      const next = { ...prev };
      delete next[reply.id];
      return next;
    });

    try {
      await deleteReportReply(reply.id);
      deletedReplyIdsRef.current.add(reply.id);
      setConfirmDeleteReplyId(null);
      setLoadedReplies((prev) => prev.filter((item) => item.id !== reply.id));
      setRecentTailReplies((prev) => prev.filter((item) => item.id !== reply.id));

      if (reply.moderationStatus === 'visible') {
        const nextCount = Math.max(0, publicReplyCount - 1);
        setPublicReplyCount(nextCount);
        onReplyCountChange?.(report.id, nextCount);
      }
    } catch (err) {
      setDeleteErrorByReplyId((prev) => ({
        ...prev,
        [reply.id]:
          err instanceof Error
            ? err.message
            : 'Não foi possível excluir a resposta agora.',
      }));
    } finally {
      setDeletingReplyId(null);
    }
  };

  const handleOpenReplyFlag = (reply: BeachReportReply) => {
    setOpenMenuReplyId(null);
    if (!user) {
      redirectToLoginWithReturn();
      return;
    }
    setFlagTargetReply(reply);
    setFlagReason(null);
    setFlagDetails('');
    setFlagError(null);
  };

  const handleSubmitReplyFlag = async (e: FormEvent) => {
    e.preventDefault();
    if (!flagTargetReply || isFlagSubmitting) return;

    if (!flagReason) {
      setFlagError('Selecione um motivo para continuar.');
      return;
    }

    const trimmedDetails = flagDetails.trim();
    if (flagReason === 'other' && trimmedDetails.length === 0) {
      setFlagError('Descreva o motivo da denúncia em “Outro”.');
      return;
    }

    if (trimmedDetails.length > MAX_FLAG_DETAILS_LENGTH) {
      setFlagError(
        `A observação deve ter no máximo ${MAX_FLAG_DETAILS_LENGTH} caracteres.`
      );
      return;
    }

    setIsFlagSubmitting(true);
    setFlagError(null);

    try {
      await submitReplyFlag({
        replyId: flagTargetReply.id,
        reason: flagReason,
        details: trimmedDetails.length > 0 ? trimmedDetails : undefined,
      });

      const flaggedId = flagTargetReply.id;
      setLoadedReplies((prev) =>
        prev.map((item) =>
          item.id === flaggedId ? { ...item, viewerHasFlagged: true } : item
        )
      );
      setRecentTailReplies((prev) =>
        prev.map((item) =>
          item.id === flaggedId ? { ...item, viewerHasFlagged: true } : item
        )
      );
      setFlagTargetReply(null);
      setFlagReason(null);
      setFlagDetails('');
      setStatusBanner(
        'Denúncia enviada. Nossa moderação vai analisar esta resposta.'
      );
    } catch (err) {
      if (err instanceof ReportFlagError && err.alreadyFlagged) {
        const flaggedId = flagTargetReply.id;
        setLoadedReplies((prev) =>
          prev.map((item) =>
            item.id === flaggedId ? { ...item, viewerHasFlagged: true } : item
          )
        );
        setRecentTailReplies((prev) =>
          prev.map((item) =>
            item.id === flaggedId ? { ...item, viewerHasFlagged: true } : item
          )
        );
        setFlagTargetReply(null);
        setStatusBanner('Você já havia denunciado esta resposta.');
        return;
      }

      setFlagError(
        err instanceof Error
          ? err.message
          : 'Não foi possível registrar sua denúncia agora.'
      );
    } finally {
      setIsFlagSubmitting(false);
    }
  };

  const reportAuthorHref = report.userUsername
    ? `/u/${encodeURIComponent(report.userUsername)}`
    : null;

  const renderReplyItem = (reply: BeachReportReply, isPublishedNow = false) => {
    const isOwnReply = Boolean(user?.id && user.id === reply.userId);
    const isHidden = reply.moderationStatus === 'hidden';
    const isConfirmingDelete = confirmDeleteReplyId === reply.id;
    const isDeletingThis = deletingReplyId === reply.id;
    const deleteError = deleteErrorByReplyId[reply.id];
    const replyAuthorHref = reply.userUsername
      ? `/u/${encodeURIComponent(reply.userUsername)}`
      : null;

    const avatarEl = reply.userAvatarUrl ? (
      <img
        src={reply.userAvatarUrl}
        alt={replyAuthorHref ? '' : reply.userName}
        referrerPolicy="no-referrer"
        className="h-8 w-8 shrink-0 rounded-full border border-sky-100 object-cover"
      />
    ) : (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-100 bg-sky-50 text-[11px] font-bold text-[#0284C7]">
        {getInitials(reply.userName)}
      </div>
    );

    return (
      <div
        key={reply.id}
        className={`rounded-xl border p-3.5 transition-colors ${
          isPublishedNow
            ? 'border-[#0284C7]/40 bg-sky-50/40'
            : 'border-[#E2E8F0] bg-white'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            {replyAuthorHref ? (
              <Link
                to={replyAuthorHref}
                onClick={onClose}
                aria-label={`Ver perfil público de ${reply.userName}`}
                className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-[#0284C7]"
              >
                {avatarEl}
              </Link>
            ) : (
              avatarEl
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                {replyAuthorHref ? (
                  <Link
                    to={replyAuthorHref}
                    onClick={onClose}
                    className="min-w-0 max-w-full break-words text-xs sm:text-sm font-bold text-[#0F172A] hover:text-[#0284C7] hover:underline"
                  >
                    {reply.userName}
                  </Link>
                ) : (
                  <span className="min-w-0 max-w-full break-words text-xs sm:text-sm font-bold text-[#0F172A]">
                    {reply.userName}
                  </span>
                )}

                {replyAuthorHref && reply.userUsername && (
                  <Link
                    to={replyAuthorHref}
                    onClick={onClose}
                    className="min-w-0 max-w-full break-all text-xs font-medium text-[#475569] hover:text-[#0284C7] hover:underline"
                  >
                    @{reply.userUsername}
                  </Link>
                )}

                <span aria-hidden="true" className="text-xs text-[#64748B]">
                  ·
                </span>
                <span className="text-xs text-[#64748B] tabular-nums whitespace-nowrap">
                  {formatRelativeTime(reply.createdAt)}
                </span>
              </div>
            </div>
          </div>

          {/* Ações na própria resposta vs resposta de outro usuário */}
          <div className="flex items-center gap-1 shrink-0">
            {isOwnReply ? (
              !isConfirmingDelete && (
                <button
                  type="button"
                  disabled={Boolean(deletingReplyId)}
                  onClick={() => setConfirmDeleteReplyId(reply.id)}
                  aria-label="Excluir minha resposta"
                  className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg px-2 text-xs font-semibold text-[#991B1B] hover:bg-[#FEE2E2]/70 disabled:opacity-50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only sm:ml-1">Excluir</span>
                </button>
              )
            ) : !isHidden ? (
              <div data-reply-menu-root="true" className="relative">
                <button
                  type="button"
                  aria-label={`Opções da resposta de ${reply.userName}`}
                  aria-haspopup="menu"
                  aria-expanded={openMenuReplyId === reply.id}
                  onClick={() =>
                    setOpenMenuReplyId((prev) =>
                      prev === reply.id ? null : reply.id
                    )
                  }
                  className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-[#475569] hover:bg-slate-100 hover:text-[#0F172A] transition-colors"
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </button>

                {openMenuReplyId === reply.id && (
                  <div
                    role="menu"
                    aria-label="Opções da resposta"
                    className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-[#E2E8F0] bg-white p-1.5 shadow-lg"
                  >
                    {Boolean(user?.id && reply.viewerHasFlagged) ? (
                      <div
                        role="menuitem"
                        aria-disabled="true"
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[#64748B]"
                      >
                        <Check className="h-3.5 w-3.5 text-[#166534]" aria-hidden="true" />
                        <span>Você já denunciou</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handleOpenReplyFlag(reply)}
                        className="flex min-h-[38px] w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#0F172A] hover:bg-slate-100 transition-colors"
                      >
                        <Flag className="h-3.5 w-3.5 text-[#92400E]" aria-hidden="true" />
                        <span>Denunciar resposta</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {isOwnReply && isHidden && (
          <div
            role="status"
            className="mt-2.5 flex items-start gap-2 rounded-lg border border-[#F59E0B]/40 bg-[#FEF3C7] px-2.5 py-2 text-xs font-medium text-[#92400E]"
          >
            <EyeOff className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span className="leading-snug">
              Resposta ocultada pela moderação — não aparece mais para outros usuários. Você pode excluí-la abaixo.
            </span>
          </div>
        )}

        {/* Texto puro sem interpretação de HTML */}
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#0F172A]">
          {reply.body}
        </p>

        {/* Confirmação inline de exclusão (sem empilhar modal) */}
        {isConfirmingDelete && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#EF4444]/30 bg-[#FEE2E2]/60 px-3 py-2">
            <span className="text-xs font-semibold text-[#991B1B]">
              Excluir esta resposta permanentemente?
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isDeletingThis}
                onClick={() => setConfirmDeleteReplyId(null)}
                className="min-h-[36px] rounded-lg border border-[#E2E8F0] bg-white px-3 text-xs font-semibold text-[#0F172A] hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingThis}
                onClick={() => void handleConfirmDeleteReply(reply)}
                className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg bg-[#991B1B] px-3 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-60"
              >
                {isDeletingThis && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                )}
                {isDeletingThis ? 'Excluindo...' : 'Confirmar exclusão'}
              </button>
            </div>
          </div>
        )}

        {deleteError && (
          <p role="alert" className="mt-2 text-xs font-medium text-[#991B1B]">
            {deleteError}
          </p>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/55 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-replies-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusyClosing) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[92vh] sm:max-h-[86vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] shadow-xl">
        {/* Cabeçalho fixo do sheet/modal */}
        <div className="shrink-0 border-b border-[#E2E8F0] bg-white px-4 py-3.5 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {flagTargetReply ? (
                <button
                  type="button"
                  disabled={isFlagSubmitting}
                  onClick={() => {
                    setFlagTargetReply(null);
                    setFlagError(null);
                  }}
                  className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-[#0284C7] hover:underline disabled:opacity-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Voltar para as respostas
                </button>
              ) : null}

              <h2
                id="report-replies-title"
                className="flex items-center gap-2 font-display text-base sm:text-lg font-bold text-[#0F172A]"
              >
                <MessageCircle className="h-4.5 w-4.5 text-[#0284C7]" aria-hidden="true" />
                {flagTargetReply ? (
                  'Denunciar resposta'
                ) : (
                  <>
                    Respostas ao relato{' '}
                    <span className="text-sm font-semibold text-[#475569] tabular-nums">
                      ({publicReplyCount})
                    </span>
                  </>
                )}
              </h2>
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              disabled={isBusyClosing}
              onClick={onClose}
              aria-label="Fechar conversa"
              className="min-h-[44px] min-w-[44px] -mt-1.5 -mr-2 shrink-0 flex items-center justify-center rounded-xl text-[#475569] hover:bg-slate-100 hover:text-[#0F172A] disabled:opacity-50 transition-colors"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Resumo do relato pai */}
          {!flagTargetReply && (
            <div className="mt-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 min-w-0 text-xs">
                  {reportAuthorHref ? (
                    <Link
                      to={reportAuthorHref}
                      onClick={onClose}
                      className="font-bold text-[#0F172A] hover:text-[#0284C7] hover:underline"
                    >
                      {report.userName}
                    </Link>
                  ) : (
                    <span className="font-bold text-[#0F172A]">
                      {report.userName}
                    </span>
                  )}

                  {reportAuthorHref && report.userUsername && (
                    <Link
                      to={reportAuthorHref}
                      onClick={onClose}
                      className="text-[#475569] hover:text-[#0284C7] hover:underline"
                    >
                      @{report.userUsername}
                    </Link>
                  )}

                  <span aria-hidden="true" className="text-[#64748B]">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-[#0284C7]">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {report.beachName}
                  </span>
                  <span aria-hidden="true" className="text-[#64748B]">
                    ·
                  </span>
                  <span className="text-[#64748B] tabular-nums">
                    {formatRelativeTime(report.createdAt)}
                  </span>
                </div>

                <SunRatingDisplay rating={report.rating} />
              </div>

              {report.comment && (
                <p className="mt-1.5 line-clamp-3 break-words text-xs sm:text-sm leading-relaxed text-[#334155]">
                  {report.comment}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Corpo rolável: ou painel inline de denúncia ou lista cronológica de respostas */}
        {flagTargetReply ? (
          <form
            onSubmit={handleSubmitReplyFlag}
            noValidate
            className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-white"
          >
            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs space-y-1">
              <p className="font-bold text-[#0F172A]">
                Resposta de {flagTargetReply.userName}
              </p>
              <p className="whitespace-pre-wrap break-words text-[#475569] line-clamp-3">
                {flagTargetReply.body}
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-bold text-[#0F172A]">
                Qual o motivo da denúncia?
              </legend>
              <div className="space-y-2 pt-1">
                {REPORT_FLAG_REASONS.map((item) => {
                  const selected = flagReason === item.value;
                  return (
                    <label
                      key={item.value}
                      className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                        selected
                          ? 'border-[#0284C7] bg-sky-50/70'
                          : 'border-[#E2E8F0] bg-white hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="reply-flag-reason"
                        value={item.value}
                        checked={selected}
                        disabled={isFlagSubmitting}
                        onChange={() => {
                          setFlagReason(item.value);
                          if (flagError) setFlagError(null);
                        }}
                        className="mt-0.5 h-4 w-4 accent-[#0284C7] shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="block text-sm font-semibold text-[#0F172A]">
                          {item.label}
                        </span>
                        <span className="block text-xs text-[#475569] leading-snug mt-0.5">
                          {item.description}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="reply-flag-details"
                  className="text-sm font-bold text-[#0F172A]"
                >
                  {flagReason === 'other'
                    ? 'Descreva o motivo (obrigatório)'
                    : 'Observação adicional (opcional)'}
                </label>
                <span className="text-xs text-[#475569] tabular-nums">
                  {flagDetails.length}/{MAX_FLAG_DETAILS_LENGTH}
                </span>
              </div>
              <textarea
                id="reply-flag-details"
                rows={3}
                maxLength={MAX_FLAG_DETAILS_LENGTH}
                disabled={isFlagSubmitting}
                required={flagReason === 'other'}
                value={flagDetails}
                onChange={(e) => {
                  setFlagDetails(e.target.value);
                  if (flagError) setFlagError(null);
                }}
                placeholder={
                  flagReason === 'other'
                    ? 'Explique brevemente o que há de errado nesta resposta.'
                    : 'Se quiser, adicione contexto para ajudar a moderação.'
                }
                className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] bg-white p-3 text-sm text-[#0F172A] placeholder:text-[#475569]/70 focus:border-[#0284C7] focus:outline-none resize-none disabled:bg-slate-50"
              />
            </div>

            {flagError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-[#EF4444]/30 bg-[#FEE2E2] px-3.5 py-2.5 text-xs sm:text-sm font-medium text-[#991B1B]"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span className="min-w-0 break-words">{flagError}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1 pb-2">
              <Button
                type="button"
                variant="secondary"
                disabled={isFlagSubmitting}
                onClick={() => {
                  setFlagTargetReply(null);
                  setFlagError(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={isFlagSubmitting}
                disabled={isFlagSubmitting}
              >
                {isFlagSubmitting ? 'Enviando...' : 'Enviar denúncia'}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              {statusBanner && (
                <div
                  role="status"
                  className="flex items-center justify-between gap-2 rounded-xl border border-[#10B981]/35 bg-[#DCFCE7] px-3.5 py-2 text-xs sm:text-sm font-medium text-[#166534]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">{statusBanner}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStatusBanner(null)}
                    aria-label="Fechar aviso"
                    className="shrink-0 font-bold underline text-xs"
                  >
                    Fechar
                  </button>
                </div>
              )}

              {isLoading ? (
                <div
                  className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-[#475569]"
                  aria-busy="true"
                >
                  <Loader2
                    className="h-5 w-5 animate-spin text-[#0284C7]"
                    aria-hidden="true"
                  />
                  <span>Carregando respostas...</span>
                </div>
              ) : loadError && loadedReplies.length === 0 ? (
                <div className="rounded-xl border border-[#EF4444]/30 bg-white p-5 text-center space-y-3">
                  <p className="text-sm font-semibold text-[#991B1B]">{loadError}</p>
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => void loadReplies(report.id, 0, false)}
                  >
                    Tentar novamente
                  </Button>
                </div>
              ) : loadedReplies.length === 0 && recentTailReplies.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-white px-4 py-8 text-center">
                  <p className="text-sm font-semibold text-[#0F172A]">
                    Nenhuma resposta ainda
                  </p>
                  <p className="mt-1 text-xs text-[#475569]">
                    Compartilhe uma atualização ou pergunte como estão o mar e a faixa de areia.
                  </p>
                </div>
              ) : (
                <>
                  {loadedReplies.map((reply) => renderReplyItem(reply, false))}

                  {loadError && loadedReplies.length > 0 && (
                    <p
                      role="alert"
                      className="text-center text-xs font-medium text-[#991B1B]"
                    >
                      {loadError}
                    </p>
                  )}

                  {hasMore && (
                    <div className="flex justify-center pt-1">
                      <Button
                        variant="secondary"
                        size="md"
                        loading={isLoadingMore}
                        disabled={isLoadingMore}
                        onClick={() =>
                          void loadReplies(report.id, loadedReplies.length, true)
                        }
                      >
                        {isLoadingMore
                          ? 'Carregando...'
                          : 'Carregar mais respostas'}
                      </Button>
                    </div>
                  )}

                  {recentTailReplies.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-200/70">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[#0284C7]">
                        Sua resposta publicada agora
                      </p>
                      {recentTailReplies.map((reply) => renderReplyItem(reply, true))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Composer fixo no rodapé do sheet */}
            <form
              onSubmit={handleSubmitReply}
              noValidate
              className="shrink-0 border-t border-[#E2E8F0] bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-3.5 space-y-2.5"
            >
              {submitError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-[#EF4444]/30 bg-[#FEE2E2] px-3 py-2 text-xs font-medium text-[#991B1B]"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="min-w-0 break-words">{submitError}</span>
                </div>
              )}

              <div>
                <label htmlFor="report-reply-input" className="sr-only">
                  Escreva sua resposta ao relato
                </label>
                <textarea
                  ref={composerRef}
                  id="report-reply-input"
                  rows={2}
                  maxLength={MAX_REPLY_LENGTH}
                  disabled={isSubmitting}
                  value={draftBody}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  placeholder="Responder ao relato (máx. 500 caracteres)..."
                  className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-sm text-[#0F172A] placeholder:text-[#475569]/75 focus:border-[#0284C7] focus:bg-white focus:outline-none resize-none disabled:bg-slate-100"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span
                    className={`text-xs tabular-nums ${
                      draftBody.length >= MAX_REPLY_LENGTH
                        ? 'font-semibold text-[#92400E]'
                        : 'text-[#64748B]'
                    }`}
                  >
                    {draftBody.length}/{MAX_REPLY_LENGTH}
                  </span>
                  {!user && (
                    <span className="text-[11px] text-[#475569]">
                      Ao enviar, você entrará com o Google sem perder o texto.
                    </span>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={isSubmitting}
                  disabled={isSubmitting}
                >
                  {!isSubmitting && (
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {isSubmitting
                    ? 'Enviando...'
                    : user
                      ? 'Responder'
                      : 'Entrar e responder'}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
