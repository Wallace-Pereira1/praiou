export const REPORT_PHOTOS_BUCKET = 'report-photos';
export const MAX_REPORT_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_REPORT_IMAGE_DIMENSION = 1600;

export const ALLOWED_REPORT_PHOTO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function validateReportImageFile(file: Blob): string | null {
  if (!ALLOWED_REPORT_PHOTO_MIME_TYPES.has(file.type)) {
    return 'Formato inválido. Escolha uma imagem JPEG, PNG ou WebP.';
  }
  if (file.size <= 0) {
    return 'A imagem selecionada está vazia.';
  }
  if (file.size > MAX_REPORT_PHOTO_BYTES) {
    return 'A foto deve ter no máximo 5 MB.';
  }
  return null;
}

export function getExtensionForMimeType(mimeType: string): 'jpg' | 'png' | 'webp' {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

export function generateReportUuid(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID().toLowerCase();
  }

  const bytes = new Uint8Array(16);
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20, 32)}`;
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

function loadImageFromFile(file: File): Promise<{
  image: HTMLImageElement;
  cleanup: () => void;
}> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = async () => {
      try {
        if (typeof img.decode === 'function') {
          await img.decode();
        }
      } catch {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Não foi possível decodificar este arquivo como uma imagem válida.'));
        return;
      }

      if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('O arquivo selecionado não contém uma imagem válida.'));
        return;
      }

      resolve({
        image: img,
        cleanup: () => URL.revokeObjectURL(objectUrl),
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Não foi possível abrir este arquivo como imagem. Escolha outro arquivo JPEG, PNG ou WebP.'));
    };

    img.src = objectUrl;
  });
}

export async function prepareReportImageForUpload(file: File): Promise<{
  blob: Blob;
  width: number;
  height: number;
}> {
  const initialValidationError = validateReportImageFile(file);
  if (initialValidationError) {
    throw new Error(initialValidationError);
  }

  const { image, cleanup } = await loadImageFromFile(file);

  try {
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale =
      longestSide > MAX_REPORT_IMAGE_DIMENSION
        ? MAX_REPORT_IMAGE_DIMENSION / longestSide
        : 1;

    const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Seu navegador não conseguiu preparar a foto para envio.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    const preferredMime =
      file.type === 'image/png'
        ? 'image/png'
        : file.type === 'image/webp'
        ? 'image/webp'
        : 'image/jpeg';

    let outputBlob = await canvasToBlob(
      canvas,
      preferredMime,
      preferredMime === 'image/png' ? undefined : 0.86
    );

    if (
      (!outputBlob || outputBlob.size > MAX_REPORT_PHOTO_BYTES) &&
      preferredMime === 'image/png'
    ) {
      outputBlob = await canvasToBlob(canvas, 'image/webp', 0.88);
    }

    if (!outputBlob || outputBlob.size > MAX_REPORT_PHOTO_BYTES) {
      outputBlob = await canvasToBlob(canvas, 'image/jpeg', 0.84);
    }

    if (!outputBlob) {
      throw new Error('Não foi possível processar a imagem selecionada.');
    }

    const finalValidationError = validateReportImageFile(outputBlob);
    if (finalValidationError) {
      throw new Error(finalValidationError);
    }

    return {
      blob: outputBlob,
      width: targetWidth,
      height: targetHeight,
    };
  } finally {
    cleanup();
  }
}
