import {
  AlertTriangle,
  AtSign,
  Camera,
  Check,
  Image as ImageIcon,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type RefObject,
} from 'react';
import { checkUsernameAvailability } from '../../services/profiles';
import type { AppUser } from '../../types';
import { getInitials } from '../../utils/formatters';
import {
  USERNAME_MAX_LENGTH,
  normalizeUsernameInput,
  validateUsername,
} from '../../utils/username';
import { Button } from '../ui/Button';

interface EditProfileModalProps {
  open: boolean;
  suspended: boolean;
  user: AppUser;
  profileLoading: boolean;
  isUploadingAvatar: boolean;
  isRemovingAvatar: boolean;
  avatarActionError: string | null;
  avatarSuccessMessage: string | null;
  isUploadingBanner: boolean;
  isRemovingBanner: boolean;
  bannerActionError: string | null;
  bannerSuccessMessage: string | null;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onDismissAvatarError: () => void;
  onSelectAvatarFile: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemoveCustomAvatar: () => Promise<void>;
  onDismissBannerError: () => void;
  onSelectBannerFile: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemoveCustomBanner: () => Promise<void>;
  onSaveName: (displayName: string) => Promise<void>;
  onSaveUsername: (username: string) => Promise<void>;
  onClose: () => void;
}

export function EditProfileModal({
  open,
  suspended,
  user,
  profileLoading,
  isUploadingAvatar,
  isRemovingAvatar,
  avatarActionError,
  avatarSuccessMessage,
  isUploadingBanner,
  isRemovingBanner,
  bannerActionError,
  bannerSuccessMessage,
  returnFocusRef,
  onDismissAvatarError,
  onSelectAvatarFile,
  onRemoveCustomAvatar,
  onDismissBannerError,
  onSelectBannerFile,
  onRemoveCustomBanner,
  onSaveName,
  onSaveUsername,
  onClose,
}: EditProfileModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const lastCropSelectorRef = useRef<string>('[data-photo-trigger="true"]');
  const wasOpenRef = useRef(false);
  const wasSuspendedRef = useRef(false);

  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [bannerLoadError, setBannerLoadError] = useState(false);
  const [draftName, setDraftName] = useState(user.name);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccessMessage, setNameSuccessMessage] = useState<string | null>(null);

  const [draftUsername, setDraftUsername] = useState(user.username ?? '');
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccessMessage, setUsernameSuccessMessage] = useState<string | null>(
    null
  );
  const [availabilityState, setAvailabilityState] = useState<
    | { status: 'idle' }
    | { status: 'checking'; target: string }
    | { status: 'available'; target: string }
    | { status: 'taken'; target: string }
    | { status: 'unknown'; target: string }
  >({ status: 'idle' });
  const availabilityReqRef = useRef(0);

  const isBusy =
    isSavingName ||
    isSavingUsername ||
    isUploadingAvatar ||
    isRemovingAvatar ||
    isUploadingBanner ||
    isRemovingBanner;

  useEffect(() => {
    setAvatarLoadError(false);
  }, [user.avatarUrl]);

  useEffect(() => {
    setBannerLoadError(false);
  }, [user.bannerUrl]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setDraftName(user.name);
      setNameError(null);
      setNameSuccessMessage(null);
      setDraftUsername(user.username ?? '');
      setUsernameError(null);
      setUsernameSuccessMessage(null);
      setAvailabilityState({ status: 'idle' });
    }
  }, [open, user.name, user.username]);

  // Verificação informativa de disponibilidade (a constraint do banco decide ao salvar)
  useEffect(() => {
    if (!open || suspended) return;

    const { normalized, error } = validateUsername(draftUsername);
    const currentUsername = user.username ?? '';

    if (error || !normalized || normalized === currentUsername) {
      availabilityReqRef.current += 1;
      setAvailabilityState({ status: 'idle' });
      return;
    }

    const reqId = ++availabilityReqRef.current;
    setAvailabilityState({ status: 'checking', target: normalized });

    const timer = window.setTimeout(() => {
      void checkUsernameAvailability(normalized, user.id)
        .then((res) => {
          if (availabilityReqRef.current !== reqId) return;
          setAvailabilityState({
            status: res.available ? 'available' : 'taken',
            target: res.normalized,
          });
        })
        .catch(() => {
          if (availabilityReqRef.current !== reqId) return;
          setAvailabilityState({ status: 'unknown', target: normalized });
        });
    }, 380);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open, suspended, draftUsername, user.username, user.id]);

  const handleRequestClose = useCallback(() => {
    if (isBusy) return;
    onClose();
  }, [isBusy, onClose]);

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    const justClosed = !open && wasOpenRef.current;
    const justResumedFromCrop = open && wasSuspendedRef.current && !suspended;

    wasOpenRef.current = open;
    wasSuspendedRef.current = suspended;

    if (justOpened && !suspended) {
      const frame = window.requestAnimationFrame(() => {
        dialogRef.current?.focus();
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (justResumedFromCrop) {
      const frame = window.requestAnimationFrame(() => {
        dialogRef.current
          ?.querySelector<HTMLButtonElement>(lastCropSelectorRef.current)
          ?.focus();
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (justClosed) {
      const frame = window.requestAnimationFrame(() => {
        returnFocusRef.current?.focus();
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [open, suspended, returnFocusRef]);

  useEffect(() => {
    if (!open || suspended) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isBusy) {
          onClose();
        }
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]):not([type="file"]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, suspended, isBusy, onClose]);

  if (!open) return null;

  const handleSubmitName = async (e: FormEvent) => {
    e.preventDefault();
    if (isBusy) return;

    const trimmed = draftName.trim();
    if (trimmed.length < 2 || trimmed.length > 60) {
      setNameError('Digite um nome entre 2 e 60 caracteres.');
      setNameSuccessMessage(null);
      return;
    }

    setNameError(null);
    setNameSuccessMessage(null);
    setIsSavingName(true);

    try {
      await onSaveName(trimmed);
      setDraftName(trimmed);
      setNameSuccessMessage('Nome público atualizado.');
    } catch (err) {
      setNameError(
        err instanceof Error
          ? err.message
          : 'Não foi possível salvar seu nome agora.'
      );
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSubmitUsername = async (e: FormEvent) => {
    e.preventDefault();
    if (isBusy || profileLoading) return;

    const { normalized, error } = validateUsername(draftUsername);
    if (error) {
      setUsernameError(error);
      setUsernameSuccessMessage(null);
      return;
    }

    if (normalized === (user.username ?? '')) {
      setDraftUsername(normalized);
      setUsernameError(null);
      setUsernameSuccessMessage('Este já é o seu @username atual.');
      return;
    }

    setUsernameError(null);
    setUsernameSuccessMessage(null);
    setIsSavingUsername(true);

    try {
      await onSaveUsername(normalized);
      setDraftUsername(normalized);
      setAvailabilityState({ status: 'idle' });
      setUsernameSuccessMessage(`@username atualizado para @${normalized}.`);
    } catch (err) {
      setUsernameError(
        err instanceof Error
          ? err.message
          : 'Não foi possível salvar seu @username agora.'
      );
    } finally {
      setIsSavingUsername(false);
    }
  };

  const normalizedDraftUsername = normalizeUsernameInput(draftUsername);
  const showNormalizedPreview =
    draftUsername.length > 0 && draftUsername !== normalizedDraftUsername;

  return (
    <div
      aria-hidden={suspended || undefined}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/45 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-profile-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !suspended) {
          handleRequestClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-lg focus:outline-none max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="edit-profile-title"
              className="font-display text-base font-bold text-[#0F172A]"
            >
              Editar perfil
            </h2>
            <p className="mt-0.5 text-xs text-[#475569]">
              Cada alteração é salva separadamente no seu perfil público.
            </p>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={handleRequestClose}
            aria-label="Fechar edição de perfil"
            className="min-h-[44px] min-w-[44px] -mt-2 -mr-2 flex items-center justify-center rounded-xl text-[#475569] hover:bg-slate-100 hover:text-[#0F172A] disabled:opacity-50 transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {/* Seção da foto de perfil */}
          <section
            aria-labelledby="edit-avatar-heading"
            className="space-y-3 rounded-xl border border-[#E2E8F0] bg-slate-50/60 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3
                id="edit-avatar-heading"
                className="text-sm font-bold text-[#0F172A]"
              >
                Foto de perfil
              </h3>
              <span className="text-[11px] font-medium text-[#475569]">
                Salva imediatamente
              </span>
            </div>

            <div className="flex items-center gap-4">
              {user.avatarUrl && !avatarLoadError ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarLoadError(true)}
                  className="h-16 w-16 shrink-0 rounded-full border border-[#E2E8F0] bg-white object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-sky-100 font-display text-xl font-extrabold text-[#0284C7]">
                  {getInitials(user.name)}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={onSelectAvatarFile}
                  disabled={isBusy || profileLoading}
                  className="sr-only"
                  aria-label="Selecionar arquivo de foto de perfil"
                />

                <Button
                  data-photo-trigger="true"
                  variant="secondary"
                  size="md"
                  loading={isUploadingAvatar}
                  disabled={isBusy || profileLoading}
                  onClick={() => {
                    lastCropSelectorRef.current = '[data-photo-trigger="true"]';
                    fileInputRef.current?.click();
                  }}
                >
                  {!isUploadingAvatar && (
                    <Camera className="h-4 w-4 text-[#0284C7]" aria-hidden="true" />
                  )}
                  {user.hasCustomAvatar ? 'Alterar foto' : 'Adicionar foto'}
                </Button>

                {user.hasCustomAvatar && (
                  <Button
                    variant="ghost"
                    size="md"
                    loading={isRemovingAvatar}
                    disabled={isBusy || profileLoading}
                    onClick={() => void onRemoveCustomAvatar()}
                    className="text-[#991B1B] hover:bg-[#FEE2E2]/60"
                  >
                    {!isRemovingAvatar && (
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    )}
                    {isRemovingAvatar ? 'Removendo...' : 'Remover foto'}
                  </Button>
                )}
              </div>
            </div>

            <p className="text-xs leading-relaxed text-[#475569]">
              Imagem visível publicamente no seu perfil e nos seus relatos. Formatos aceitos: JPEG, PNG ou WebP (máx. 2 MB). Ao confirmar o recorte ou remover a foto, a alteração já é salva automaticamente.
            </p>

            {avatarSuccessMessage && !avatarActionError && (
              <p
                role="status"
                className="flex items-center gap-1.5 text-xs font-semibold text-[#065F46]"
              >
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{avatarSuccessMessage}</span>
              </p>
            )}

            {avatarActionError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 rounded-xl border border-[#EF4444]/30 bg-[#FEE2E2] px-3 py-2.5 text-xs font-medium text-[#991B1B]"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{avatarActionError}</span>
                </div>
                <button
                  type="button"
                  onClick={onDismissAvatarError}
                  aria-label="Fechar erro da foto"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-red-200/50 transition-colors"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </section>

          {/* Seção da capa do perfil */}
          <section
            aria-labelledby="edit-banner-heading"
            className="space-y-3 rounded-xl border border-[#E2E8F0] bg-slate-50/60 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3
                id="edit-banner-heading"
                className="text-sm font-bold text-[#0F172A]"
              >
                Capa do perfil
              </h3>
              <span className="text-[11px] font-medium text-[#475569]">
                Salva imediatamente
              </span>
            </div>

            <div className="w-full aspect-[3/1] overflow-hidden rounded-xl border border-[#E2E8F0] bg-gradient-to-r from-sky-100 via-sky-50 to-amber-50">
              {user.bannerUrl && !bannerLoadError ? (
                <img
                  src={user.bannerUrl}
                  alt={`Capa atual de ${user.name}`}
                  onError={() => setBannerLoadError(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-medium text-[#475569]">
                  Capa padrão do Praiou?
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onSelectBannerFile}
                disabled={isBusy || profileLoading}
                className="sr-only"
                aria-label="Selecionar arquivo de capa do perfil"
              />

              <Button
                data-banner-trigger="true"
                variant="secondary"
                size="md"
                loading={isUploadingBanner}
                disabled={isBusy || profileLoading}
                onClick={() => {
                  lastCropSelectorRef.current = '[data-banner-trigger="true"]';
                  bannerInputRef.current?.click();
                }}
              >
                {!isUploadingBanner && (
                  <ImageIcon className="h-4 w-4 text-[#0284C7]" aria-hidden="true" />
                )}
                {user.hasCustomBanner ? 'Alterar capa' : 'Adicionar capa'}
              </Button>

              {user.hasCustomBanner && (
                <Button
                  variant="ghost"
                  size="md"
                  loading={isRemovingBanner}
                  disabled={isBusy || profileLoading}
                  onClick={() => void onRemoveCustomBanner()}
                  className="text-[#991B1B] hover:bg-[#FEE2E2]/60"
                >
                  {!isRemovingBanner && (
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isRemovingBanner ? 'Removendo...' : 'Remover capa'}
                </Button>
              )}
            </div>

            <p className="text-xs leading-relaxed text-[#475569]">
              Capa visível publicamente no topo do seu perfil. Formatos aceitos: JPEG, PNG ou WebP (máx. 3 MB). Ao confirmar o recorte ou remover a capa, a alteração já é salva automaticamente.
            </p>

            {bannerSuccessMessage && !bannerActionError && (
              <p
                role="status"
                className="flex items-center gap-1.5 text-xs font-semibold text-[#065F46]"
              >
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{bannerSuccessMessage}</span>
              </p>
            )}

            {bannerActionError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 rounded-xl border border-[#EF4444]/30 bg-[#FEE2E2] px-3 py-2.5 text-xs font-medium text-[#991B1B]"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{bannerActionError}</span>
                </div>
                <button
                  type="button"
                  onClick={onDismissBannerError}
                  aria-label="Fechar erro da capa"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-red-200/50 transition-colors"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </section>

          {/* Seção do nome público */}
          <section
            aria-labelledby="edit-name-heading"
            className="space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <label
                id="edit-name-heading"
                htmlFor="edit-profile-name-input"
                className="text-sm font-bold text-[#0F172A]"
              >
                Nome de exibição público
              </label>
              <span className="text-[11px] font-medium text-[#475569]">
                Salvo ao confirmar
              </span>
            </div>

            <form onSubmit={handleSubmitName} className="space-y-3">
              <input
                id="edit-profile-name-input"
                type="text"
                value={draftName}
                onChange={(e) => {
                  setDraftName(e.target.value);
                  setNameError(null);
                  setNameSuccessMessage(null);
                }}
                maxLength={60}
                disabled={isBusy}
                className="min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm font-semibold text-[#0F172A] focus:border-[#0284C7] focus:outline-none disabled:bg-slate-50"
              />

              <p className="text-xs text-[#475569]">
                Entre 2 e 60 caracteres. Exibido no seu perfil e nos seus relatos.
              </p>

              {nameError && (
                <p role="alert" className="text-xs font-medium text-[#991B1B]">
                  {nameError}
                </p>
              )}

              {nameSuccessMessage && !nameError && (
                <p
                  role="status"
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#065F46]"
                >
                  <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{nameSuccessMessage}</span>
                </p>
              )}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="md"
                  loading={isSavingName}
                  disabled={isBusy}
                >
                  {!isSavingName && <Check className="h-4 w-4" aria-hidden="true" />}
                  {isSavingName ? 'Salvando nome...' : 'Salvar nome'}
                </Button>
              </div>
            </form>
          </section>

          {/* Seção do @username público */}
          <section
            aria-labelledby="edit-username-heading"
            className="space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <label
                id="edit-username-heading"
                htmlFor="edit-profile-username-input"
                className="text-sm font-bold text-[#0F172A]"
              >
                Identificador público (@username)
              </label>
              <span className="text-[11px] font-medium text-[#475569]">
                Salvo ao confirmar
              </span>
            </div>

            <form onSubmit={handleSubmitUsername} noValidate className="space-y-3">
              <div className="flex min-h-[44px] items-center rounded-xl border border-[#CBD5E1] bg-white focus-within:border-[#0284C7] disabled:bg-slate-50">
                <span
                  aria-hidden="true"
                  className="pl-3 pr-1 text-sm font-bold text-[#64748B] select-none"
                >
                  <AtSign className="h-4 w-4" />
                </span>
                <input
                  id="edit-profile-username-input"
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={draftUsername}
                  onChange={(e) => {
                    setDraftUsername(e.target.value);
                    setUsernameError(null);
                    setUsernameSuccessMessage(null);
                  }}
                  maxLength={USERNAME_MAX_LENGTH + 1}
                  disabled={isBusy || profileLoading}
                  placeholder="seu_nome_na_praia"
                  className="min-h-[42px] w-full rounded-r-xl bg-transparent pr-3 text-sm font-semibold text-[#0F172A] placeholder:text-[#64748B]/70 focus:outline-none disabled:text-[#64748B]"
                />
              </div>

              <p className="text-xs leading-relaxed text-[#475569]">
                De 3 a 24 caracteres: letras minúsculas sem acento (a-z), números e underline (_).
                {user.username ? ` Endereço atual: /u/${user.username}.` : ''}
              </p>

              {showNormalizedPreview && !usernameError && (
                <p className="text-xs font-medium text-[#0284C7] break-all">
                  Será salvo sem @ e em minúsculas: @{normalizedDraftUsername}
                </p>
              )}

              {availabilityState.status === 'checking' && (
                <p className="flex items-center gap-1.5 text-xs text-[#475569]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden="true" />
                  <span>Verificando disponibilidade...</span>
                </p>
              )}

              {availabilityState.status === 'available' && !usernameError && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-[#065F46] break-all">
                  <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    @{availabilityState.target} parece disponível (confirmado ao salvar).
                  </span>
                </p>
              )}

              {availabilityState.status === 'taken' && !usernameError && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-[#991B1B] break-all">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>@{availabilityState.target} já está em uso por outra conta.</span>
                </p>
              )}

              {availabilityState.status === 'unknown' && !usernameError && (
                <p className="text-xs text-[#64748B]">
                  Não foi possível consultar disponibilidade agora; tente salvar para confirmar no banco.
                </p>
              )}

              <div className="rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-[11px] leading-relaxed text-[#92400E]">
                Trocar seu @username altera o endereço público do seu perfil e o identificador anterior pode ficar disponível para outra pessoa, sem redirecionamento automático.
              </div>

              {usernameError && (
                <p role="alert" className="text-xs font-medium text-[#991B1B]">
                  {usernameError}
                </p>
              )}

              {usernameSuccessMessage && !usernameError && (
                <p
                  role="status"
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#065F46] break-all"
                >
                  <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{usernameSuccessMessage}</span>
                </p>
              )}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="md"
                  loading={isSavingUsername}
                  disabled={isBusy || profileLoading}
                >
                  {!isSavingUsername && <Check className="h-4 w-4" aria-hidden="true" />}
                  {isSavingUsername ? 'Salvando @username...' : 'Salvar @username'}
                </Button>
              </div>
            </form>
          </section>
        </div>

        <div className="mt-5 flex items-center justify-end border-t border-slate-100 pt-4">
          <Button
            variant="secondary"
            disabled={isBusy}
            onClick={handleRequestClose}
          >
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
