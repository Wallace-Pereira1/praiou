import { LOCAL_BEACH_PHOTOS } from '../data/localPhotos';

function delay(ms = 80): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const MOCK_PHOTO_MAP: Record<string, string> = {
  'reports/mock/ipanema.svg': LOCAL_BEACH_PHOTOS.ipanemaDoisIrmaos,
  'reports/mock/arpoador.svg': LOCAL_BEACH_PHOTOS.arpoadorRocks,
  'reports/mock/barra.svg': LOCAL_BEACH_PHOTOS.barraHorizonte,
  'reports/mock/copacabana.svg': LOCAL_BEACH_PHOTOS.copacabanaCalcadao,
  'reports/mock/sao-conrado.svg': LOCAL_BEACH_PHOTOS.saoConradoSwell,
  'reports/mock/recreio.svg': LOCAL_BEACH_PHOTOS.recreioPontal,
};

export async function getSignedPhotoUrl(photoPath: string): Promise<string | null> {
  await delay(60);
  if (!photoPath) return null;
  if (photoPath.startsWith('blob:') || photoPath.startsWith('data:')) {
    return photoPath;
  }
  return MOCK_PHOTO_MAP[photoPath] ?? null;
}

export async function getSignedPhotoUrls(
  photoPaths: string[]
): Promise<Record<string, string>> {
  await delay(90);
  const result: Record<string, string> = {};
  for (const path of photoPaths) {
    if (path.startsWith('blob:') || path.startsWith('data:')) {
      result[path] = path;
    } else if (MOCK_PHOTO_MAP[path]) {
      result[path] = MOCK_PHOTO_MAP[path];
    }
  }
  return result;
}
