import { ImageOff, X } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';

interface ReportPhotoViewerModalProps {
  open: boolean;
  photoUrl: string;
  alt: string;
  authorName: string;
  beachName: string;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

export function ReportPhotoViewerModal({
  open,
  photoUrl,
  alt,
  authorName,
  beachName,
  returnFocusRef,
  onClose,
}: ReportPhotoViewerModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [photoUrl, open]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true;
      window.setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 0);
    } else if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
      window.setTimeout(() => {
        returnFocusRef?.current?.focus();
      }, 0);
    }
  }, [open, returnFocusRef]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        closeButtonRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-photo-viewer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2
              id="report-photo-viewer-title"
              className="truncate font-display text-sm sm:text-base font-bold text-[#0F172A]"
            >
              Foto do relato em {beachName}
            </h2>
            <p className="truncate text-xs text-[#475569]">
              Enviada por {authorName}
            </p>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar visualização da foto"
            className="min-h-[44px] min-w-[44px] -mr-1 flex shrink-0 items-center justify-center rounded-xl text-[#475569] hover:bg-slate-100 hover:text-[#0F172A] transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-950/95 p-3 sm:p-5">
          {imageError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-slate-200">
              <ImageOff className="h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="text-sm font-medium">
                Não foi possível carregar esta foto agora.
              </p>
            </div>
          ) : (
            <img
              src={photoUrl}
              alt={alt}
              onError={() => setImageError(true)}
              className="max-h-[72vh] max-w-full w-auto h-auto rounded-lg object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}
