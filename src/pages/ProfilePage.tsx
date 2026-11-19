import {
  AlertTriangle,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  User as UserIcon,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthMethodsPanel } from '../components/auth/AuthMethodsPanel';
import { AppLayout } from '../components/layout/AppLayout';
import { AvatarCropModal } from '../components/social/AvatarCropModal';
import { BannerCropModal } from '../components/social/BannerCropModal';
import { EditProfileModal } from '../components/social/EditProfileModal';
import { ReportCard } from '../components/social/ReportCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { useApp } from '../context/AppContext';
import { validateAvatarFile, validateBannerFile } from '../services/profiles';
import * as reportsService from '../services/reports';
import type { BeachReport } from '../types';
import { getInitials } from '../utils/formatters';

export function ProfilePage() {
  const {
    user,
    authReady,
    profileError,
    profileLoading,
    refreshProfile,
    updateProfileName,
    uploadProfileAvatar,
    removeProfileAvatar,
    uploadProfileBanner,
    removeProfileBanner,
    logout,
  } = useApp();
  const navigate = useNavigate();

  const editProfileButtonRef = useRef<HTMLButtonElement | null>(null);

  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [bannerLoadError, setBannerLoadError] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);
  const [avatarActionError, setAvatarActionError] = useState<string | null>(null);
  const [avatarSuccessMessage, setAvatarSuccessMessage] = useState<string | null>(null);
  const [cropError, setCropError] = useState<string | null>(null);

  const [pendingBannerFile, setPendingBannerFile] = useState<File | null>(null);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [isRemovingBanner, setIsRemovingBanner] = useState(false);
  const [bannerActionError, setBannerActionError] = useState<string | null>(null);
  const [bannerSuccessMessage, setBannerSuccessMessage] = useState<string | null>(null);
  const [bannerCropError, setBannerCropError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [userReports, setUserReports] = useState<BeachReport[]>([]);
  const [userReportsTotal, setUserReportsTotal] = useState(0);
  const [evaluatedBeachesCount, setEvaluatedBeachesCount] = useState(0);
  const [reportsPage, setReportsPage] = useState(1);
  const [reportsHasMore, setReportsHasMore] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsLoadingMore, setReportsLoadingMore] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reportPendingDelete, setReportPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    setAvatarLoadError(false);
  }, [user?.avatarUrl]);

  useEffect(() => {
    setBannerLoadError(false);
  }, [user?.bannerUrl]);

  const loadUserReports = useCallback(
    async (userId: string, targetPage: number, append: boolean) => {
      if (append) {
        setReportsLoadingMore(true);
      } else {
        setReportsLoading(true);
      }
      setReportsError(null);

      try {
        const [pageResult, beachesTotal] = await Promise.all([
          reportsService.getReportsByUser(userId, {
            page: targetPage,
            pageSize: reportsService.DEFAULT_REPORTS_PAGE_SIZE,
          }),
          append
            ? Promise.resolve(null)
            : reportsService.getUserEvaluatedBeachesCount(userId),
        ]);

        setReportsPage(pageResult.page);
        setUserReportsTotal(pageResult.totalCount);
        setReportsHasMore(pageResult.hasMore);

        if (beachesTotal !== null) {
          setEvaluatedBeachesCount(beachesTotal);
        }

        if (append) {
          setUserReports((prev) => {
            const seen = new Set(prev.map((r) => r.id));
            const next = pageResult.items.filter((r) => !seen.has(r.id));
            return [...prev, ...next];
          });
        } else {
          setUserReports(pageResult.items);
        }
      } catch (err) {
        if (!append) {
          setUserReports([]);
          setUserReportsTotal(0);
          setEvaluatedBeachesCount(0);
          setReportsHasMore(false);
        }
        setReportsError(
          err instanceof Error
            ? err.message
            : 'Não foi possível carregar seus relatos agora.'
        );
      } finally {
        setReportsLoading(false);
        setReportsLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!authReady || !user?.id) {
      setUserReports([]);
      setUserReportsTotal(0);
      setEvaluatedBeachesCount(0);
      setReportsHasMore(false);
      setReportsError(null);
      return;
    }

    void loadUserReports(user.id, 1, false);
  }, [authReady, user?.id, loadUserReports]);

  const handleSaveName = async (displayName: string) => {
    const updated = await updateProfileName(displayName);
    setUserReports((prev) =>
      prev.map((r) =>
        r.userId === updated.id ? { ...r, userName: updated.displayName } : r
      )
    );
  };

  const handleConfirmDelete = async () => {
    if (!reportPendingDelete || !user) return;
    const targetId = reportPendingDelete;
    setReportPendingDelete(null);
    setDeleteError(null);

    try {
      await reportsService.deleteReport(targetId);
      setUserReports((prev) => prev.filter((r) => r.id !== targetId));
      setUserReportsTotal((prev) => Math.max(0, prev - 1));
      try {
        const updatedBeachesCount = await reportsService.getUserEvaluatedBeachesCount(
          user.id
        );
        setEvaluatedBeachesCount(updatedBeachesCount);
      } catch {
        // Mantém contagem anterior se a atualização secundária falhar
      }
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : 'Não foi possível excluir o relato agora.'
      );
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const anyMediaBusy =
    isUploadingAvatar ||
    isRemovingAvatar ||
    isUploadingBanner ||
    isRemovingBanner;

  const handleSelectAvatarFile = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!selected || anyMediaBusy) return;

    setAvatarActionError(null);
    setAvatarSuccessMessage(null);
    setCropError(null);

    const validationError = validateAvatarFile(selected);
    if (validationError) {
      setAvatarActionError(validationError);
      return;
    }

    setPendingAvatarFile(selected);
  };

  const handleSaveCroppedAvatar = async (croppedBlob: Blob) => {
    if (anyMediaBusy) return;
    setCropError(null);
    setAvatarActionError(null);
    setAvatarSuccessMessage(null);
    setIsUploadingAvatar(true);

    try {
      const updated = await uploadProfileAvatar(croppedBlob);
      setUserReports((prev) =>
        prev.map((r) =>
          r.userId === updated.id ? { ...r, userAvatarUrl: updated.avatarUrl } : r
        )
      );
      setPendingAvatarFile(null);
      setAvatarSuccessMessage('Foto de perfil atualizada.');
    } catch (err) {
      setCropError(
        err instanceof Error
          ? err.message
          : 'Não foi possível salvar a nova foto agora. Sua foto anterior foi mantida.'
      );
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleRemoveCustomAvatar = async () => {
    if (anyMediaBusy || !user?.hasCustomAvatar) return;
    setAvatarActionError(null);
    setAvatarSuccessMessage(null);
    setIsRemovingAvatar(true);

    try {
      const updated = await removeProfileAvatar();
      setUserReports((prev) =>
        prev.map((r) =>
          r.userId === updated.id ? { ...r, userAvatarUrl: updated.avatarUrl } : r
        )
      );
      setAvatarSuccessMessage('Foto personalizada removida do perfil.');
    } catch (err) {
      setAvatarActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível remover sua foto personalizada agora.'
      );
    } finally {
      setIsRemovingAvatar(false);
    }
  };

  const handleSelectBannerFile = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!selected || anyMediaBusy) return;

    setBannerActionError(null);
    setBannerSuccessMessage(null);
    setBannerCropError(null);

    const validationError = validateBannerFile(selected);
    if (validationError) {
      setBannerActionError(validationError);
      return;
    }

    setPendingBannerFile(selected);
  };

  const handleSaveCroppedBanner = async (croppedBlob: Blob) => {
    if (anyMediaBusy) return;
    setBannerCropError(null);
    setBannerActionError(null);
    setBannerSuccessMessage(null);
    setIsUploadingBanner(true);

    try {
      await uploadProfileBanner(croppedBlob);
      setPendingBannerFile(null);
      setBannerSuccessMessage('Capa do perfil atualizada.');
    } catch (err) {
      setBannerCropError(
        err instanceof Error
          ? err.message
          : 'Não foi possível salvar a nova capa agora. Sua capa anterior foi mantida.'
      );
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const handleRemoveCustomBanner = async () => {
    if (anyMediaBusy || !user?.hasCustomBanner) return;
    setBannerActionError(null);
    setBannerSuccessMessage(null);
    setIsRemovingBanner(true);

    try {
      await removeProfileBanner();
      setBannerSuccessMessage('Capa personalizada removida do perfil.');
    } catch (err) {
      setBannerActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível remover sua capa personalizada agora.'
      );
    } finally {
      setIsRemovingBanner(false);
    }
  };

  return (
    <AppLayout>
      {!authReady ? (
        <div className="mx-auto max-w-md py-8">
          <Card padding="lg" className="p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-[#0284C7]">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            </div>
            <p className="mt-3 text-sm font-medium text-[#475569]">
              Verificando sua sessão...
            </p>
          </Card>
        </div>
      ) : !user ? (
        <div className="mx-auto max-w-md py-4">
          <EmptyState
            icon={<UserIcon className="h-6 w-6" aria-hidden="true" />}
            title="Entre no Praiou?"
            description="Acesse sua conta para gerenciar seu perfil, acompanhar seus relatos e avaliar as praias do Rio."
            action={<AuthMethodsPanel returnTo="/perfil" />}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Erro recuperável ao consultar public.profiles sem deslogar */}
          {profileError && (
            <div
              role="alert"
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-[#F59E0B]/40 bg-[#FEF3C7] px-4 py-3 text-sm text-[#92400E]"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{profileError}</span>
              </div>
              <Button
                variant="secondary"
                size="md"
                loading={profileLoading}
                onClick={() => void refreshProfile()}
              >
                Tentar novamente
              </Button>
            </div>
          )}

          {/* Card do perfil com capa horizontal no topo */}
          <Card padding="none" className="overflow-hidden">
            {/* Capa horizontal (sem botões fixos sobrepostos) */}
            <div className="h-28 sm:h-40 w-full bg-gradient-to-r from-sky-100 via-sky-50 to-amber-50 border-b border-[#E2E8F0]">
              {user.bannerUrl && !bannerLoadError && (
                <img
                  src={user.bannerUrl}
                  alt={`Capa do perfil de ${user.name}`}
                  onError={() => setBannerLoadError(true)}
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            <div className="px-5 pb-5 sm:px-6 sm:pb-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4 min-w-0">
                  {/* Avatar sobrepondo levemente a borda inferior da capa */}
                  <div className="-mt-9 sm:-mt-10 relative z-10 shrink-0 self-start rounded-full ring-4 ring-white bg-white">
                    {user.avatarUrl && !avatarLoadError ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.name}
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarLoadError(true)}
                        className="h-18 w-18 sm:h-20 sm:w-20 rounded-full border border-[#E2E8F0] object-cover"
                      />
                    ) : (
                      <div className="flex h-18 w-18 sm:h-20 sm:w-20 items-center justify-center rounded-full border border-[#E2E8F0] bg-sky-100 font-display text-xl sm:text-2xl font-extrabold text-[#0284C7]">
                        {getInitials(user.name)}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 sm:pb-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h1 className="truncate font-display text-xl font-bold text-[#0F172A]">
                        {user.name}
                      </h1>
                      {!profileError && (
                        <button
                          ref={editProfileButtonRef}
                          type="button"
                          onClick={() => {
                            setAvatarActionError(null);
                            setAvatarSuccessMessage(null);
                            setBannerActionError(null);
                            setBannerSuccessMessage(null);
                            setIsEditProfileOpen(true);
                          }}
                          aria-label="Editar perfil"
                          className="min-h-[44px] inline-flex items-center gap-1 rounded-xl px-2.5 text-xs font-semibold text-[#0284C7] hover:bg-sky-50 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          Editar perfil
                        </button>
                      )}
                    </div>

                    <p className="mt-0.5 truncate text-sm text-[#475569]">
                      {user.email ? `${user.email} · ` : ''}Conta Google
                    </p>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  loading={isLoggingOut}
                  disabled={isLoggingOut}
                  onClick={handleLogout}
                  className="self-start sm:self-auto"
                >
                  {!isLoggingOut && (
                    <LogOut className="h-4 w-4 text-[#475569]" aria-hidden="true" />
                  )}
                  {isLoggingOut ? 'Saindo...' : 'Sair'}
                </Button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                <div>
                  <span className="text-xs font-medium text-[#475569]">
                    Relatos publicados
                  </span>
                  <p className="mt-0.5 font-display text-2xl font-extrabold text-[#0F172A] tabular-nums">
                    {reportsLoading || reportsError ? '—' : userReportsTotal}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-medium text-[#475569]">
                    Praias avaliadas
                  </span>
                  <p className="mt-0.5 font-display text-2xl font-extrabold text-[#0F172A] tabular-nums">
                    {reportsLoading || reportsError ? '—' : evaluatedBeachesCount}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Lista de relatos do usuário */}
          <section className="space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-[#0F172A]">
                Meus relatos{' '}
                {!reportsLoading && !reportsError && (
                  <span className="text-[#475569] font-semibold tabular-nums">
                    ({userReportsTotal})
                  </span>
                )}
              </h2>
              <Link
                to="/relatar"
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-[#0284C7] bg-white px-3.5 text-sm font-semibold text-[#0284C7] hover:bg-sky-50 transition-colors whitespace-nowrap"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Novo relato
              </Link>
            </div>

            {deleteError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 rounded-xl border border-[#EF4444]/30 bg-[#FEE2E2] px-4 py-2.5 text-sm font-medium text-[#991B1B]"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{deleteError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteError(null)}
                  aria-label="Fechar erro"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-red-200/50 transition-colors"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {reportsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy="true">
                {[1, 2].map((n) => (
                  <Card key={n} padding="md">
                    <div className="space-y-3">
                      <Skeleton className="h-10 w-44" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  </Card>
                ))}
              </div>
            ) : reportsError && userReports.length === 0 ? (
              <ErrorState
                title="Não foi possível carregar seus relatos"
                description={reportsError}
                onRetry={() => void loadUserReports(user.id, 1, false)}
              />
            ) : userReports.length === 0 ? (
              <EmptyState
                icon={<Plus className="h-6 w-6" aria-hidden="true" />}
                title="Você ainda não publicou relatos"
                description="Quando passar pela praia, conte em poucos segundos como estão o mar e a areia."
                action={
                  <Link
                    to="/relatar"
                    className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#0284C7] px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 transition-colors"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Publicar primeiro relato
                  </Link>
                }
              />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {userReports.map((report) => (
                    <ReportCard
                      key={report.id}
                      report={report}
                      showBeachLink
                      onDeleteRequest={
                        user.id === report.userId
                          ? (id) => setReportPendingDelete(id)
                          : undefined
                      }
                    />
                  ))}
                </div>

                {reportsHasMore && (
                  <div className="flex justify-center pt-1">
                    <Button
                      variant="secondary"
                      loading={reportsLoadingMore}
                      disabled={reportsLoadingMore}
                      onClick={() =>
                        void loadUserReports(user.id, reportsPage + 1, true)
                      }
                    >
                      {reportsLoadingMore ? 'Carregando...' : 'Carregar mais relatos'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>

          <EditProfileModal
            open={isEditProfileOpen}
            suspended={Boolean(pendingAvatarFile || pendingBannerFile)}
            user={user}
            profileLoading={profileLoading}
            isUploadingAvatar={isUploadingAvatar}
            isRemovingAvatar={isRemovingAvatar}
            avatarActionError={avatarActionError}
            avatarSuccessMessage={avatarSuccessMessage}
            isUploadingBanner={isUploadingBanner}
            isRemovingBanner={isRemovingBanner}
            bannerActionError={bannerActionError}
            bannerSuccessMessage={bannerSuccessMessage}
            returnFocusRef={editProfileButtonRef}
            onDismissAvatarError={() => setAvatarActionError(null)}
            onSelectAvatarFile={handleSelectAvatarFile}
            onRemoveCustomAvatar={handleRemoveCustomAvatar}
            onDismissBannerError={() => setBannerActionError(null)}
            onSelectBannerFile={handleSelectBannerFile}
            onRemoveCustomBanner={handleRemoveCustomBanner}
            onSaveName={handleSaveName}
            onClose={() => {
              setIsEditProfileOpen(false);
              setAvatarActionError(null);
              setAvatarSuccessMessage(null);
              setBannerActionError(null);
              setBannerSuccessMessage(null);
            }}
          />

          <AvatarCropModal
            file={pendingAvatarFile}
            saving={isUploadingAvatar}
            errorMessage={cropError}
            onClose={() => {
              if (!isUploadingAvatar) {
                setPendingAvatarFile(null);
                setCropError(null);
              }
            }}
            onSave={handleSaveCroppedAvatar}
          />

          <BannerCropModal
            file={pendingBannerFile}
            saving={isUploadingBanner}
            errorMessage={bannerCropError}
            onClose={() => {
              if (!isUploadingBanner) {
                setPendingBannerFile(null);
                setBannerCropError(null);
              }
            }}
            onSave={handleSaveCroppedBanner}
          />

          <ConfirmModal
            open={reportPendingDelete !== null}
            title="Excluir este relato?"
            description="Ele será removido do seu perfil e deixará de aparecer no feed da praia."
            confirmLabel="Excluir relato"
            cancelLabel="Manter"
            destructive
            onConfirm={handleConfirmDelete}
            onCancel={() => setReportPendingDelete(null)}
          />
        </div>
      )}
    </AppLayout>
  );
}
