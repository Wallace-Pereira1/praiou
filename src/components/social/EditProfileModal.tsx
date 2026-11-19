import {
  AlertTriangle,
  Camera,
  Check,
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
import type { AppUser } from '../../types';
import { getInitials } from '../../utils/formatters';
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
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onDismissAvatarError: () => void;
  onSelectAvatarFile: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemoveCustomAvatar: () => Promise<void>;
  onSaveName: (displayName: string) => Promise<void>;
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
  returnFocusRef,
  onDismissAvatarError,
  onSelectAvatarFile,
  onRemoveCustomAvatar,
  onSaveName,
  onClose,
}: EditProfileModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const wasOpenRef = useRef(false);
  const wasSuspendedRef = useRef(false);

  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [draftName, setDraftName] = useState(user.name);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccessMessage, setNameSuccessMessage] = useState<string | null>(null);

  const isBusy = isSavingName || isUploadingAvatar || isRemovingAvatar;

  useEffect(() => {
    setAvatarLoadError(false);
  }, [user.avatarUrl]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setDraftName(user.name);
      setNameError(null);
      setNameSuccessMessage(null);
    }
  }, [open, user.name]);

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
          ?.querySelector<HTMLButtonElement>('[data-photo-trigger="true"]')
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
                  onClick={() => fileInputRef.current?.click()}
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
