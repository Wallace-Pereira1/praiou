import {
  AlertTriangle,
  Move,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { MAX_BANNER_BYTES } from '../../services/profiles';
import { Button } from '../ui/Button';

const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 400;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.05;

interface BannerCropModalProps {
  file: File | null;
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSave: (croppedBlob: Blob) => Promise<void> | void;
}

interface Offset {
  x: number;
  y: number;
}

function clampOffset(
  img: HTMLImageElement,
  zoom: number,
  offset: Offset
): Offset {
  const coverScale = Math.max(
    OUTPUT_WIDTH / img.naturalWidth,
    OUTPUT_HEIGHT / img.naturalHeight
  );
  const effectiveScale = coverScale * zoom;
  const drawnW = img.naturalWidth * effectiveScale;
  const drawnH = img.naturalHeight * effectiveScale;
  const maxX = Math.max(0, (drawnW - OUTPUT_WIDTH) / 2);
  const maxY = Math.max(0, (drawnH - OUTPUT_HEIGHT) / 2);

  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

function drawCroppedBanner(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  zoom: number,
  offset: Offset
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const coverScale = Math.max(
    OUTPUT_WIDTH / img.naturalWidth,
    OUTPUT_HEIGHT / img.naturalHeight
  );
  const effectiveScale = coverScale * zoom;
  const drawnW = img.naturalWidth * effectiveScale;
  const drawnH = img.naturalHeight * effectiveScale;
  const clamped = clampOffset(img, zoom, offset);
  const drawX = (OUTPUT_WIDTH - drawnW) / 2 + clamped.x;
  const drawY = (OUTPUT_HEIGHT - drawnH) / 2 + clamped.y;

  ctx.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, drawX, drawY, drawnW, drawnH);
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

async function exportCroppedBannerBlob(
  img: HTMLImageElement,
  sourceMimeType: string,
  zoom: number,
  offset: Offset
): Promise<Blob> {
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = OUTPUT_WIDTH;
  exportCanvas.height = OUTPUT_HEIGHT;
  drawCroppedBanner(exportCanvas, img, zoom, offset);

  const candidates: Array<{ mime: string; quality?: number }> =
    sourceMimeType === 'image/png'
      ? [
          { mime: 'image/png' },
          { mime: 'image/webp', quality: 0.9 },
          { mime: 'image/jpeg', quality: 0.85 },
        ]
      : sourceMimeType === 'image/webp'
      ? [
          { mime: 'image/webp', quality: 0.9 },
          { mime: 'image/webp', quality: 0.78 },
        ]
      : [
          { mime: 'image/jpeg', quality: 0.9 },
          { mime: 'image/jpeg', quality: 0.78 },
        ];

  for (const candidate of candidates) {
    const blob = await canvasToBlob(
      exportCanvas,
      candidate.mime,
      candidate.quality
    );
    if (blob && blob.size > 0 && blob.size <= MAX_BANNER_BYTES) {
      return blob;
    }
  }

  throw new Error('Não foi possível preparar a capa dentro do limite de 3 MB.');
}

export function BannerCropModal({
  file,
  saving,
  errorMessage,
  onClose,
  onSave,
}: BannerCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startOffset: Offset;
  } | null>(null);

  const [imageReady, setImageReady] = useState(false);
  const [imageLoadError, setImageLoadError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });

  useEffect(() => {
    if (!file) {
      loadedImageRef.current = null;
      setImageReady(false);
      setImageLoadError(null);
      setExportError(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      return;
    }

    let active = true;
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    setImageReady(false);
    setImageLoadError(null);
    setExportError(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });

    img.onload = () => {
      if (!active) return;
      if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
        setImageLoadError('Não foi possível ler as dimensões desta imagem.');
        return;
      }
      loadedImageRef.current = img;
      setImageReady(true);
    };

    img.onerror = () => {
      if (!active) return;
      loadedImageRef.current = null;
      setImageLoadError('Não foi possível abrir este arquivo de imagem.');
    };

    img.src = objectUrl;

    return () => {
      active = false;
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = loadedImageRef.current;
    if (!canvas || !img || !imageReady) return;
    drawCroppedBanner(canvas, img, zoom, offset);
  }, [imageReady, zoom, offset]);

  useEffect(() => {
    if (!file) return;

    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKey);
    };
  }, [file, saving, onClose]);

  const updateZoom = useCallback((nextZoom: number) => {
    const clampedZoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Number(nextZoom.toFixed(2)))
    );
    setZoom(clampedZoom);
    const img = loadedImageRef.current;
    if (img) {
      setOffset((prev) => clampOffset(img, clampedZoom, prev));
    }
  }, []);

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!imageReady || saving) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffset: offset,
    };
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;
    const img = loadedImageRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !img || saving) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const scaleToOutput = rect.width > 0 ? OUTPUT_WIDTH / rect.width : 1;
    const dx = (e.clientX - drag.startClientX) * scaleToOutput;
    const dy = (e.clientY - drag.startClientY) * scaleToOutput;

    setOffset(
      clampOffset(img, zoom, {
        x: drag.startOffset.x + dx,
        y: drag.startOffset.y + dy,
      })
    );
  };

  const handlePointerUpOrCancel = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragStateRef.current?.pointerId === e.pointerId) {
      dragStateRef.current = null;
    }
  };

  const handleConfirmSave = async () => {
    const img = loadedImageRef.current;
    if (!file || !img || !imageReady || saving) return;
    setExportError(null);

    try {
      const blob = await exportCroppedBannerBlob(img, file.type, zoom, offset);
      await onSave(blob);
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : 'Não foi possível preparar a capa para envio.'
      );
    }
  };

  if (!file) return null;

  const combinedError = errorMessage || imageLoadError || exportError;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="banner-crop-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-lg focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="banner-crop-title"
              className="font-display text-base font-bold text-[#0F172A]"
            >
              Ajustar capa do perfil
            </h2>
            <p className="mt-0.5 text-xs text-[#475569]">
              Enquadramento horizontal (3:1) para o topo do seu perfil.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Fechar ajuste de capa"
            className="min-h-[44px] min-w-[44px] -mt-2 -mr-2 flex items-center justify-center rounded-xl text-[#475569] hover:bg-slate-100 hover:text-[#0F172A] disabled:opacity-50 transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Área de enquadramento horizontal 3:1 */}
          <div className="relative w-full aspect-[3/1] overflow-hidden rounded-xl border border-[#E2E8F0] bg-slate-100 select-none">
            <canvas
              ref={canvasRef}
              width={OUTPUT_WIDTH}
              height={OUTPUT_HEIGHT}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUpOrCancel}
              onPointerCancel={handlePointerUpOrCancel}
              aria-label="Pré-visualização do enquadramento horizontal da capa"
              className={`h-full w-full touch-none ${
                imageReady && !saving
                  ? 'cursor-grab active:cursor-grabbing'
                  : 'cursor-default'
              }`}
            />
          </div>

          <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-[#475569]">
            <Move className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Arraste a imagem e ajuste o zoom para enquadrar a capa.
          </p>

          {/* Controles de zoom */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!imageReady || saving || zoom <= MIN_ZOOM}
              onClick={() => updateZoom(zoom - 0.2)}
              aria-label="Diminuir zoom da capa"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#475569] hover:bg-slate-50 hover:text-[#0F172A] disabled:opacity-45 transition-colors"
            >
              <ZoomOut className="h-4 w-4" aria-hidden="true" />
            </button>

            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={ZOOM_STEP}
              value={zoom}
              disabled={!imageReady || saving}
              onChange={(e) => updateZoom(Number(e.target.value))}
              aria-label="Zoom do recorte da capa"
              className="h-2 flex-1 cursor-pointer accent-[#0284C7] disabled:opacity-45"
            />

            <button
              type="button"
              disabled={!imageReady || saving || zoom >= MAX_ZOOM}
              onClick={() => updateZoom(zoom + 0.2)}
              aria-label="Aumentar zoom da capa"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#475569] hover:bg-slate-50 hover:text-[#0F172A] disabled:opacity-45 transition-colors"
            >
              <ZoomIn className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              disabled={
                !imageReady ||
                saving ||
                (zoom === 1 && offset.x === 0 && offset.y === 0)
              }
              onClick={() => {
                setZoom(1);
                setOffset({ x: 0, y: 0 });
              }}
              aria-label="Centralizar enquadramento da capa"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#475569] hover:bg-slate-50 hover:text-[#0F172A] disabled:opacity-45 transition-colors"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-[#475569]">
            Sua capa de perfil fica visível publicamente no topo do seu perfil.
          </p>

          {combinedError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-[#EF4444]/30 bg-[#FEE2E2] px-3 py-2.5 text-xs font-medium text-[#991B1B]"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{combinedError}</span>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!imageReady || Boolean(imageLoadError) || saving}
            onClick={() => void handleConfirmSave()}
          >
            {saving ? 'Salvando capa...' : 'Salvar capa'}
          </Button>
        </div>
      </div>
    </div>
  );
}
