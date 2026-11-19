import { DEMO_USER_ID, MOCK_REPORTS } from '../data/mockReports';
import type { AppUser, BeachReport, CreateReportPayload } from '../types';
import { getCurrentUser } from './auth';
import { getBeaches } from './beaches';
import { getSignedPhotoUrl } from './photoUrls';

let reportsStore: BeachReport[] = [...MOCK_REPORTS];

function delay(ms = 160): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function resolveReportPhoto(report: BeachReport): Promise<BeachReport> {
  if (!report.photoPath || report.photoUrl) {
    return report;
  }
  const signedUrl = await getSignedPhotoUrl(report.photoPath);
  return {
    ...report,
    photoUrl: signedUrl ?? undefined,
  };
}

export async function getAllReports(): Promise<BeachReport[]> {
  await delay(150);
  const sorted = [...reportsStore].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return Promise.all(sorted.map(resolveReportPhoto));
}

export async function getReportsByBeach(beachId: string): Promise<BeachReport[]> {
  await delay(130);
  const filtered = reportsStore
    .filter((report) => report.beachId === beachId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return Promise.all(filtered.map(resolveReportPhoto));
}

export async function createReport(
  payload: CreateReportPayload
): Promise<BeachReport> {
  await delay(500);

  const beaches = await getBeaches();
  const beach = beaches.find((b) => b.id === payload.beachId);
  if (!beach) {
    throw new Error('Praia selecionada não foi encontrada.');
  }

  const currentUser: AppUser = (await getCurrentUser()) ?? {
    id: DEMO_USER_ID,
    name: 'Marina Costa',
    email: 'marina@praiou.app',
    provider: 'google',
  };

  let photoUrl = payload.photoPreviewUrl;
  let photoPath: string | undefined;

  if (payload.photoFile) {
    photoPath = `reports/${currentUser.id}/${Date.now()}-${payload.photoFile.name}`;
    if (!photoUrl) {
      photoUrl = URL.createObjectURL(payload.photoFile);
    }
  }

  const newReport: BeachReport = {
    id: `rep-${Date.now()}`,
    beachId: beach.id,
    beachSlug: beach.slug,
    beachName: beach.name,
    userId: currentUser.id,
    userName: currentUser.name,
    rating: payload.rating,
    comment: payload.comment?.trim() ?? '',
    photoPath,
    photoUrl,
    photoAlt: photoUrl ? `Foto enviada por ${currentUser.name} em ${beach.name}` : undefined,
    createdAt: new Date().toISOString(),
    flagsCount: 0,
  };

  reportsStore = [newReport, ...reportsStore];
  return newReport;
}

export async function deleteReport(reportId: string): Promise<void> {
  await delay(200);
  reportsStore = reportsStore.filter((report) => report.id !== reportId);
}

export async function flagReport(reportId: string): Promise<void> {
  await delay(180);
  reportsStore = reportsStore.map((report) =>
    report.id === reportId
      ? { ...report, flagsCount: report.flagsCount + 1 }
      : report
  );
}

export function syncAuthorNameInReports(userId: string, newName: string): void {
  reportsStore = reportsStore.map((report) =>
    report.userId === userId ? { ...report, userName: newName } : report
  );
}
