import { supabase } from '../lib/supabase';
import type {
  BeachReport,
  CreateReportFallbackDisplay,
  CreateReportPayload,
  PaginatedReportsResult,
} from '../types';
import {
  REPORT_PHOTOS_BUCKET,
  generateReportUuid,
  getExtensionForMimeType,
  validateReportImageFile,
} from '../utils/reportImage';
import { resolveProfileAvatarUrl } from './profiles';

export const DEFAULT_REPORTS_PAGE_SIZE = 20;

export type ReportSubmissionStage =
  | 'preparing'
  | 'checking'
  | 'uploading'
  | 'saving';

export interface CreateReportCallbacks {
  onStageChange?: (stage: ReportSubmissionStage) => void;
  onPhotoUploaded?: (photoPath: string) => void;
}

export class ReportPublishError extends Error {
  readonly ambiguous: boolean;
  readonly uploadedPhotoPath?: string;

  constructor(
    message: string,
    options: { ambiguous?: boolean; uploadedPhotoPath?: string } = {}
  ) {
    super(message);
    this.name = 'ReportPublishError';
    this.ambiguous = Boolean(options.ambiguous);
    this.uploadedPhotoPath = options.uploadedPhotoPath;
  }
}

interface JoinedProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_path: string | null;
}

interface JoinedBeachRow {
  id: string;
  slug: string;
  name: string;
}

interface BaseBeachReportRow {
  id: string;
  beach_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  photo_path: string | null;
  created_at: string;
}

interface SupabaseBeachReportRow extends BaseBeachReportRow {
  profiles?: JoinedProfileRow | JoinedProfileRow[] | null;
  beaches?: JoinedBeachRow | JoinedBeachRow[] | null;
}

const BASE_REPORT_SELECT =
  'id, beach_id, user_id, rating, comment, photo_path, created_at';

const REPORT_SELECT = `
  id,
  beach_id,
  user_id,
  rating,
  comment,
  photo_path,
  created_at,
  profiles:user_id (
    id,
    display_name,
    avatar_url,
    avatar_path
  ),
  beaches:beach_id (
    id,
    slug,
    name
  )
`;

export function getReportPhotoPublicUrl(
  photoPath?: string | null
): string | undefined {
  const trimmedPath = photoPath?.trim();
  if (!trimmedPath || !supabase) {
    return undefined;
  }

  const { data } = supabase.storage
    .from(REPORT_PHOTOS_BUCKET)
    .getPublicUrl(trimmedPath);
  return data.publicUrl || undefined;
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeRating(raw: number): 1 | 2 | 3 | 4 | 5 {
  if (raw <= 1) return 1;
  if (raw >= 5) return 5;
  return Math.round(raw) as 1 | 2 | 3 | 4 | 5;
}

function mapSupabaseReport(
  row: SupabaseBeachReportRow,
  fallbackDisplay?: CreateReportFallbackDisplay
): BeachReport {
  const profile = unwrapRelation(row.profiles);
  const beach = unwrapRelation(row.beaches);
  const beachName = beach?.name ?? fallbackDisplay?.beachName ?? 'Praia do Rio';
  const photoPath = row.photo_path?.trim() || undefined;
  const photoUrl = getReportPhotoPublicUrl(photoPath);

  return {
    id: row.id,
    beachId: row.beach_id,
    beachSlug: beach?.slug ?? fallbackDisplay?.beachSlug ?? '',
    beachName,
    userId: row.user_id,
    userName:
      profile?.display_name?.trim() ||
      fallbackDisplay?.userName?.trim() ||
      'Banhista',
    userAvatarUrl:
      resolveProfileAvatarUrl(profile?.avatar_path, profile?.avatar_url) ??
      fallbackDisplay?.userAvatarUrl,
    rating: normalizeRating(Number(row.rating)),
    comment: row.comment ?? '',
    photoPath,
    photoUrl,
    photoAlt: photoUrl ? `Foto enviada no relato sobre ${beachName}` : undefined,
    createdAt: row.created_at,
  };
}

interface FetchReportsOptions {
  page?: number;
  pageSize?: number;
  beachId?: string;
  userId?: string;
}

async function fetchPaginatedReports(
  options: FetchReportsOptions = {}
): Promise<PaginatedReportsResult> {
  if (!supabase) {
    throw new Error('Conexão com o Supabase não configurada.');
  }

  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(
    1,
    Math.min(50, options.pageSize ?? DEFAULT_REPORTS_PAGE_SIZE)
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('beach_reports')
    .select(REPORT_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);

  if (options.beachId) {
    query = query.eq('beach_id', options.beachId);
  }

  if (options.userId) {
    query = query.eq('user_id', options.userId);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error('Não foi possível carregar os relatos agora.');
  }

  const rows = (data ?? []) as SupabaseBeachReportRow[];
  const items = rows.map((row) => mapSupabaseReport(row));
  const totalCount = typeof count === 'number' ? count : items.length;

  return {
    items,
    totalCount,
    page,
    pageSize,
    hasMore: from + items.length < totalCount,
  };
}

export async function getAllReports(
  options: { page?: number; pageSize?: number; beachId?: string } = {}
): Promise<PaginatedReportsResult> {
  return fetchPaginatedReports(options);
}

export async function getReportsByBeach(
  beachId: string,
  options: { page?: number; pageSize?: number } = {}
): Promise<PaginatedReportsResult> {
  return fetchPaginatedReports({ ...options, beachId });
}

export async function getReportsByUser(
  userId: string,
  options: { page?: number; pageSize?: number } = {}
): Promise<PaginatedReportsResult> {
  return fetchPaginatedReports({ ...options, userId });
}

export async function getUserEvaluatedBeachesCount(userId: string): Promise<number> {
  if (!supabase) {
    throw new Error('Conexão com o Supabase não configurada.');
  }

  const { data, error } = await supabase
    .from('beach_reports')
    .select('beach_id')
    .eq('user_id', userId)
    .limit(1000);

  if (error) {
    throw new Error('Não foi possível contabilizar as praias avaliadas.');
  }

  const distinctBeaches = new Set(
    (data ?? [])
      .map((row) => (row as { beach_id?: string }).beach_id)
      .filter((id): id is string => Boolean(id))
  );
  return distinctBeaches.size;
}

async function tryRemoveReportPhoto(photoPath?: string | null): Promise<boolean> {
  const trimmedPath = photoPath?.trim();
  if (!trimmedPath || !supabase) {
    return true;
  }

  try {
    const { error } = await supabase.storage
      .from(REPORT_PHOTOS_BUCKET)
      .remove([trimmedPath]);
    return !error;
  } catch {
    return false;
  }
}

type CheckReportResult =
  | { status: 'found'; row: BaseBeachReportRow }
  | { status: 'not_found' }
  | { status: 'error' };

async function checkReportById(reportId: string): Promise<CheckReportResult> {
  if (!supabase) {
    return { status: 'error' };
  }

  try {
    const { data, error } = await supabase
      .from('beach_reports')
      .select(BASE_REPORT_SELECT)
      .eq('id', reportId)
      .maybeSingle();

    if (error) {
      return { status: 'error' };
    }

    if (data) {
      return { status: 'found', row: data as BaseBeachReportRow };
    }

    return { status: 'not_found' };
  } catch {
    return { status: 'error' };
  }
}

async function enrichReportForDisplay(
  baseRow: BaseBeachReportRow,
  fallbackDisplay?: CreateReportFallbackDisplay
): Promise<BeachReport> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('beach_reports')
        .select(REPORT_SELECT)
        .eq('id', baseRow.id)
        .single();

      if (!error && data) {
        return mapSupabaseReport(data as SupabaseBeachReportRow, fallbackDisplay);
      }
    } catch {
      // Se a consulta secundária de exibição falhar, o relato já foi gravado e
      // retornamos os dados confirmados do INSERT com fallback de exibição.
    }
  }

  return mapSupabaseReport(baseRow, fallbackDisplay);
}

export async function createReport(
  payload: CreateReportPayload,
  callbacks?: CreateReportCallbacks
): Promise<BeachReport> {
  if (!supabase) {
    throw new ReportPublishError('Conexão com o Supabase não configurada.');
  }

  callbacks?.onStageChange?.('preparing');

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const sessionUser = sessionData.session?.user;

  if (sessionError || !sessionUser) {
    throw new ReportPublishError('Entre com sua conta Google para publicar um relato.');
  }

  const trimmedComment = payload.comment?.trim() ?? '';
  if (trimmedComment.length > 180) {
    throw new ReportPublishError('O comentário deve ter no máximo 180 caracteres.');
  }

  let targetPhotoPath = payload.existingPhotoPath?.trim() || null;

  if (payload.photoBlob && !targetPhotoPath) {
    const photoValidationError = validateReportImageFile(payload.photoBlob);
    if (photoValidationError) {
      throw new ReportPublishError(photoValidationError);
    }
  }

  const reportId = payload.reportId?.trim().toLowerCase() || generateReportUuid();

  if (payload.isRetryAfterAmbiguousError) {
    callbacks?.onStageChange?.('checking');
    const previousCheck = await checkReportById(reportId);

    if (previousCheck.status === 'found') {
      return enrichReportForDisplay(previousCheck.row, payload.fallbackDisplay);
    }

    if (previousCheck.status === 'error') {
      throw new ReportPublishError(
        'Não foi possível confirmar se a tentativa anterior foi salva. Tente novamente quando sua conexão estabilizar.',
        {
          ambiguous: true,
          uploadedPhotoPath: targetPhotoPath ?? undefined,
        }
      );
    }
  }

  if (payload.photoBlob && !targetPhotoPath) {
    callbacks?.onStageChange?.('uploading');

    const extension = getExtensionForMimeType(payload.photoBlob.type);
    const candidatePath = `${sessionUser.id}/${reportId}/${generateReportUuid()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(REPORT_PHOTOS_BUCKET)
      .upload(candidatePath, payload.photoBlob, {
        contentType: payload.photoBlob.type,
        cacheControl: '31536000',
        upsert: false,
      });

    if (uploadError) {
      throw new ReportPublishError(
        'Não foi possível enviar a foto do relato agora. Seu relato não foi publicado; tente novamente.',
        { ambiguous: false }
      );
    }

    targetPhotoPath = candidatePath;
    callbacks?.onPhotoUploaded?.(candidatePath);
  }

  callbacks?.onStageChange?.('saving');

  const { data: insertedData, error: insertError } = await supabase
    .from('beach_reports')
    .insert({
      id: reportId,
      beach_id: payload.beachId,
      user_id: sessionUser.id,
      rating: payload.rating,
      comment: trimmedComment.length > 0 ? trimmedComment : null,
      photo_path: targetPhotoPath,
    })
    .select(BASE_REPORT_SELECT)
    .single();

  if (insertError || !insertedData) {
    callbacks?.onStageChange?.('checking');
    const confirmAfterError = await checkReportById(reportId);

    if (confirmAfterError.status === 'found') {
      return enrichReportForDisplay(confirmAfterError.row, payload.fallbackDisplay);
    }

    if (confirmAfterError.status === 'error') {
      throw new ReportPublishError(
        'A conexão falhou durante a confirmação do envio. Tente novamente para verificar ou concluir sem duplicar.',
        {
          ambiguous: true,
          uploadedPhotoPath: targetPhotoPath ?? undefined,
        }
      );
    }

    if (targetPhotoPath) {
      await tryRemoveReportPhoto(targetPhotoPath);
    }

    throw new ReportPublishError(
      'Não foi possível publicar seu relato no banco. Verifique sua conexão e tente novamente.',
      { ambiguous: false }
    );
  }

  return enrichReportForDisplay(
    insertedData as BaseBeachReportRow,
    payload.fallbackDisplay
  );
}

export async function deleteReport(reportId: string): Promise<void> {
  if (!supabase) {
    throw new Error('Conexão com o Supabase não configurada.');
  }

  const { data, error } = await supabase
    .from('beach_reports')
    .delete()
    .eq('id', reportId)
    .select('id, photo_path');

  if (error) {
    throw new Error('Não foi possível excluir o relato agora. Tente novamente.');
  }

  const deletedRow = (data as Array<{ id?: string; photo_path?: string | null }> | null)?.[0];
  if (!deletedRow || deletedRow.id !== reportId) {
    throw new Error('Relato não encontrado ou você não tem permissão para excluí-lo.');
  }

  if (deletedRow.photo_path) {
    await tryRemoveReportPhoto(deletedRow.photo_path);
  }
}
