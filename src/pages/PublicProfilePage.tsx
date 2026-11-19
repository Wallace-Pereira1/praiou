import { Check, Share2, User as UserIcon, Waves } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { ReportCard } from '../components/social/ReportCard';
import { ReportFlagModal } from '../components/social/ReportFlagModal';
import { ReportRepliesModal } from '../components/social/ReportRepliesModal';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { useApp } from '../context/AppContext';
import { useReportConversation } from '../hooks/useReportConversation';
import { useReportFlagActions } from '../hooks/useReportFlagActions';
import { useReportHelpfulActions } from '../hooks/useReportHelpfulActions';
import {
  getPublicProfileByUsername,
  getPublicProfileStats,
} from '../services/profiles';
import * as reportsService from '../services/reports';
import type { BeachReport, PublicProfile, PublicProfileStats } from '../types';
import { getInitials } from '../utils/formatters';
import { sharePublicProfile } from '../utils/shareProfile';
import { USERNAME_REGEX, normalizeUsernameInput } from '../utils/username';

export function PublicProfilePage() {
  const { username: rawUsernameParam } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { user, authReady } = useApp();

  const normalizedParam = normalizeUsernameInput(rawUsernameParam ?? '');

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [stats, setStats] = useState<PublicProfileStats>({
    visibleReportsCount: 0,
    evaluatedBeachesCount: 0,
  });
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [reports, setReports] = useState<BeachReport[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [bannerLoadError, setBannerLoadError] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<{
    type: 'copied' | 'error';
    message: string;
  } | null>(null);

  const requestIdRef = useRef(0);
  const shareTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setAvatarLoadError(false);
  }, [profile?.avatarUrl]);

  useEffect(() => {
    setBannerLoadError(false);
  }, [profile?.bannerUrl]);

  useEffect(() => {
    return () => {
      if (shareTimerRef.current !== null) {
        window.clearTimeout(shareTimerRef.current);
      }
    };
  }, []);

  const loadPublicProfile = useCallback(async () => {
    const reqId = ++requestIdRef.current;

    setIsLoadingProfile(true);
    setNotFound(false);
    setLoadError(null);
    setLoadMoreError(null);
    setShareFeedback(null);

    if (!USERNAME_REGEX.test(normalizedParam)) {
      setProfile(null);
      setReports([]);
      setStats({ visibleReportsCount: 0, evaluatedBeachesCount: 0 });
      setHasMore(false);
      setNotFound(true);
      setIsLoadingProfile(false);
      return;
    }

    try {
      const loadedProfile = await getPublicProfileByUsername(normalizedParam);
      if (requestIdRef.current !== reqId) return;

      if (!loadedProfile) {
        setProfile(null);
        setReports([]);
        setStats({ visibleReportsCount: 0, evaluatedBeachesCount: 0 });
        setHasMore(false);
        setNotFound(true);
        return;
      }

      if (rawUsernameParam && rawUsernameParam !== loadedProfile.username) {
        navigate(`/u/${encodeURIComponent(loadedProfile.username)}`, {
          replace: true,
        });
      }

      const [loadedStats, loadedReports] = await Promise.all([
        getPublicProfileStats(loadedProfile.id),
        reportsService.getPublicReportsByUser(loadedProfile.id, {
          page: 1,
          pageSize: reportsService.DEFAULT_REPORTS_PAGE_SIZE,
        }),
      ]);

      if (requestIdRef.current !== reqId) return;

      setProfile(loadedProfile);
      setStats(loadedStats);
      setReports(loadedReports.items);
      setPage(loadedReports.page);
      setHasMore(loadedReports.hasMore);
    } catch (err) {
      if (requestIdRef.current !== reqId) return;
      setProfile(null);
      setReports([]);
      setStats({ visibleReportsCount: 0, evaluatedBeachesCount: 0 });
      setHasMore(false);
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar este perfil público agora.'
      );
    } finally {
      if (requestIdRef.current === reqId) {
        setIsLoadingProfile(false);
      }
    }
  }, [normalizedParam, rawUsernameParam, navigate]);

  useEffect(() => {
    if (!authReady) return;
    void loadPublicProfile();
  }, [authReady, loadPublicProfile]);

  const handleLoadMore = async () => {
    if (!profile || isLoadingMore || !hasMore) return;
    const targetUserId = profile.id;
    const reqId = requestIdRef.current;

    setIsLoadingMore(true);
    setLoadMoreError(null);

    try {
      const nextResult = await reportsService.getPublicReportsByUser(targetUserId, {
        page: page + 1,
        pageSize: reportsService.DEFAULT_REPORTS_PAGE_SIZE,
      });

      if (requestIdRef.current !== reqId) return;

      setPage(nextResult.page);
      setHasMore(nextResult.hasMore);
      setReports((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const next = nextResult.items.filter((r) => !seen.has(r.id));
        return [...prev, ...next];
      });
    } catch (err) {
      if (requestIdRef.current !== reqId) return;
      setLoadMoreError(
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar mais relatos agora.'
      );
    } finally {
      if (requestIdRef.current === reqId) {
        setIsLoadingMore(false);
      }
    }
  };

  const canonicalReturnTo = profile
    ? `/u/${encodeURIComponent(profile.username)}`
    : USERNAME_REGEX.test(normalizedParam)
      ? `/u/${encodeURIComponent(normalizedParam)}`
      : '/feed';

  const helpfulActions = useReportHelpfulActions({
    userId: user?.id ?? null,
    authReady,
    items: reports,
    setItems: setReports,
    returnTo: canonicalReturnTo,
  });

  const flagActions = useReportFlagActions({
    userId: user?.id ?? null,
    setItems: setReports,
    returnTo: canonicalReturnTo,
  });

  const conversation = useReportConversation({
    authReady,
    items: reports,
    setItems: setReports,
    baseReturnTo: canonicalReturnTo,
  });

  const handleShare = async () => {
    if (!profile) return;
    if (shareTimerRef.current !== null) {
      window.clearTimeout(shareTimerRef.current);
      shareTimerRef.current = null;
    }

    const result = await sharePublicProfile({
      displayName: profile.displayName,
      username: profile.username,
    });

    if (result.status === 'copied') {
      setShareFeedback({
        type: 'copied',
        message: 'Link do perfil copiado para compartilhar.',
      });
      shareTimerRef.current = window.setTimeout(() => {
        setShareFeedback(null);
      }, 2600);
    } else if (result.status === 'error') {
      setShareFeedback({
        type: 'error',
        message:
          result.errorMessage ??
          'Não foi possível compartilhar o perfil agora.',
      });
    } else {
      setShareFeedback(null);
    }
  };

  return (
    <AppLayout>
      <div className="min-w-0 space-y-6">
        {isLoadingProfile ? (
          <div className="space-y-6" aria-busy="true">
            <Card padding="none" className="overflow-hidden">
              <Skeleton className="h-28 sm:h-40 w-full rounded-none" />
              <div className="px-5 pb-5 sm:px-6 sm:pb-6 space-y-4">
                <div className="flex items-end gap-4">
                  <Skeleton className="-mt-9 sm:-mt-10 h-18 w-18 sm:h-20 sm:w-20 rounded-full ring-4 ring-white" />
                  <div className="flex-1 space-y-2 pt-2">
                    <Skeleton className="h-6 w-44" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                  <Skeleton className="h-12 w-28" />
                  <Skeleton className="h-12 w-28" />
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map((n) => (
                <Card key={n} padding="md">
                  <div className="space-y-3">
                    <Skeleton className="h-10 w-44" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ) : loadError ? (
          <ErrorState
            title="Não foi possível carregar este perfil"
            description={loadError}
            onRetry={() => void loadPublicProfile()}
          />
        ) : notFound || !profile ? (
          <div className="mx-auto max-w-md py-4">
            <EmptyState
              icon={<UserIcon className="h-6 w-6" aria-hidden="true" />}
              title="Perfil não encontrado"
              description="Não encontramos nenhuma conta pública com este @username. Confira o endereço ou volte para explorar as praias."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Link
                    to="/"
                    className="min-h-[44px] inline-flex items-center justify-center rounded-xl bg-[#0284C7] px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 transition-colors"
                  >
                    Ir para as praias
                  </Link>
                  <Link
                    to="/feed"
                    className="min-h-[44px] inline-flex items-center justify-center rounded-xl border border-[#E2E8F0] bg-white px-5 py-2.5 text-sm font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors"
                  >
                    Ver feed
                  </Link>
                </div>
              }
            />
          </div>
        ) : (
          <>
            {/* Cartão público do perfil (sem controles privados) */}
            <Card padding="none" className="overflow-hidden">
              <div className="h-28 sm:h-40 w-full bg-gradient-to-r from-sky-100 via-sky-50 to-amber-50 border-b border-[#E2E8F0]">
                {profile.bannerUrl && !bannerLoadError && (
                  <img
                    src={profile.bannerUrl}
                    alt={`Capa do perfil de ${profile.displayName}`}
                    onError={() => setBannerLoadError(true)}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>

              <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4 min-w-0">
                    <div className="-mt-9 sm:-mt-10 relative z-10 shrink-0 self-start rounded-full ring-4 ring-white bg-white">
                      {profile.avatarUrl && !avatarLoadError ? (
                        <img
                          src={profile.avatarUrl}
                          alt={profile.displayName}
                          referrerPolicy="no-referrer"
                          onError={() => setAvatarLoadError(true)}
                          className="h-18 w-18 sm:h-20 sm:w-20 rounded-full border border-[#E2E8F0] object-cover"
                        />
                      ) : (
                        <div className="flex h-18 w-18 sm:h-20 sm:w-20 items-center justify-center rounded-full border border-[#E2E8F0] bg-sky-100 font-display text-xl sm:text-2xl font-extrabold text-[#0284C7]">
                          {getInitials(profile.displayName)}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 sm:pb-0.5">
                      <h1 className="min-w-0 max-w-full break-words font-display text-xl font-bold text-[#0F172A]">
                        {profile.displayName}
                      </h1>
                      <p className="mt-0.5 min-w-0 max-w-full break-all text-sm font-semibold text-[#475569]">
                        @{profile.username}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="secondary"
                    onClick={() => void handleShare()}
                    className="self-start sm:self-auto shrink-0"
                  >
                    {shareFeedback?.type === 'copied' ? (
                      <Check className="h-4 w-4 text-[#166534]" aria-hidden="true" />
                    ) : (
                      <Share2 className="h-4 w-4 text-[#0284C7]" aria-hidden="true" />
                    )}
                    {shareFeedback?.type === 'copied'
                      ? 'Link copiado'
                      : 'Compartilhar perfil'}
                  </Button>
                </div>

                {shareFeedback && (
                  <div
                    role={shareFeedback.type === 'error' ? 'alert' : 'status'}
                    className={`mt-3 flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium ${
                      shareFeedback.type === 'error'
                        ? 'border-[#EF4444]/30 bg-[#FEE2E2] text-[#991B1B]'
                        : 'border-[#0284C7]/30 bg-sky-50 text-[#0284C7]'
                    }`}
                  >
                    <span className="min-w-0 break-words">{shareFeedback.message}</span>
                    <button
                      type="button"
                      onClick={() => setShareFeedback(null)}
                      aria-label="Fechar aviso"
                      className="shrink-0 font-bold underline"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                  <div>
                    <span className="text-xs font-medium text-[#475569]">
                      Relatos públicos
                    </span>
                    <p className="mt-0.5 font-display text-2xl font-extrabold text-[#0F172A] tabular-nums">
                      {stats.visibleReportsCount}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-[#475569]">
                      Praias avaliadas
                    </span>
                    <p className="mt-0.5 font-display text-2xl font-extrabold text-[#0F172A] tabular-nums">
                      {stats.evaluatedBeachesCount}
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Relatos públicos do perfil (somente moderation_status = 'visible') */}
            <section className="space-y-3.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-lg font-bold text-[#0F172A]">
                  Relatos públicos{' '}
                  <span className="text-[#475569] font-semibold tabular-nums">
                    ({stats.visibleReportsCount})
                  </span>
                </h2>
              </div>

              {reports.length === 0 ? (
                <EmptyState
                  icon={<Waves className="h-6 w-6" aria-hidden="true" />}
                  title="Ainda não há relatos públicos"
                  description={`Quando @${profile.username} compartilhar impressões das praias do Rio, elas aparecerão aqui.`}
                />
              ) : (
                <div className="space-y-4">
                  {helpfulActions.hasHelpfulLoadError && (
                    <div
                      role="alert"
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#F59E0B]/40 bg-[#FEF3C7] px-3.5 py-2.5 text-xs sm:text-sm font-medium text-[#92400E]"
                    >
                      <span className="min-w-0 flex-1 break-words">
                        Não foi possível carregar as contagens de “Foi útil” agora.
                      </span>
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

                  <div className="grid min-w-0 grid-cols-1 md:grid-cols-2 gap-4">
                    {reports.map((report) => (
                      <ReportCard
                        key={report.id}
                        report={report}
                        showBeachLink
                        currentUserId={user?.id ?? null}
                        isHelpfulPending={helpfulActions.pendingHelpfulIds.has(report.id)}
                        helpfulError={helpfulActions.helpfulErrorById[report.id] ?? null}
                        onToggleHelpful={helpfulActions.handleToggleHelpful}
                        onDismissHelpfulError={helpfulActions.dismissHelpfulError}
                        onOpenReplies={conversation.openConversation}
                        onFlagRequest={
                          user?.id !== report.userId
                            ? flagActions.handleOpenFlagModal
                            : undefined
                        }
                      />
                    ))}
                  </div>

                  {loadMoreError && (
                    <p className="text-center text-xs font-medium text-[#991B1B]">
                      {loadMoreError}
                    </p>
                  )}

                  {hasMore && (
                    <div className="flex justify-center pt-1">
                      <Button
                        variant="secondary"
                        loading={isLoadingMore}
                        disabled={isLoadingMore}
                        onClick={() => void handleLoadMore()}
                      >
                        {isLoadingMore ? 'Carregando...' : 'Carregar mais relatos'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}

        <ReportRepliesModal
          key={conversation.activeReport?.id ?? 'none'}
          report={conversation.activeReport}
          returnTo={
            conversation.activeReport
              ? conversation.getConversationReturnTo(conversation.activeReport.id)
              : canonicalReturnTo
          }
          onClose={conversation.closeConversation}
          onReplyCountChange={conversation.handleReplyCountChange}
        />

        <ReportFlagModal
          report={flagActions.flagTargetReport}
          onClose={flagActions.handleCloseFlagModal}
          onFlagSuccess={flagActions.handleFlagSuccess}
        />
      </div>
    </AppLayout>
  );
}
