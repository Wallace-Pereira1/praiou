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
import { getMyFlaggedReportIds } from './moderation';
import { getPublicProfileStats, resolveProfileAvatarUrl } from './profiles';

export const DEFAULT_REPORTS_PAGE_SIZE = 20;
const MAX_HELPFUL_SUMMARY_BATCH = 50;

export interface HelpfulReactionSummary {
  reportId: string;
  helpfulCount: number;
  viewerHasReacted: boolean;
}

export class HelpfulReactionMutationError extends Error {
  readonly reconciled?: HelpfulReactionSummary;

  constructor(message: string, reconciled?: HelpfulReactionSummary) {
    super(message);
    this.name = 'HelpfulReactionMutationError';
    this.reconciled = reconciled;
  }
}

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
  username: string | null;
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
  moderation_status?: string | null;
  moderated_at?: string | null;
}

interface SupabaseBeachReportRow extends BaseBeachReportRow {
  profiles?: JoinedProfileRow | JoinedProfileRow[] | null;
  beaches?: JoinedBeachRow | JoinedBeachRow[] | null;
}

interface HelpfulSummaryRpcRow {
  report_id: string;
  helpful_count: number | string | null;
  viewer_has_reacted: boolean | null;
}

const BASE_REPORT_SELECT =
  'id, beach_id, user_id, rating, comment, photo_path, created_at, moderation_status, moderated_at';

const REPORT_SELECT = `
  id,
  beach_id,
  user_id,
  rating,
  comment,
  photo_path,
  created_at,
  moderation_status,
  moderated_at,
  profiles:user_id (
    id,
    display_name,
    username,
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
  fallbackDisplay?: CreateReportFallbackDisplay,
  helpfulSummary?: HelpfulReactionSummary,
  helpfulLoadError = false,
  viewerHasFlagged = false
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
    userUsername:
      profile?.username?.trim() ||
      fallbackDisplay?.userUsername?.trim() ||
      undefined,
    userAvatarUrl:
      resolveProfileAvatarUrl(profile?.avatar_path, profile?.avatar_url) ??
      fallbackDisplay?.userAvatarUrl,
    rating: normalizeRating(Number(row.rating)),
    comment: row.comment ?? '',
    photoPath,
    photoUrl,
    photoAlt: photoUrl ? `Foto enviada no relato sobre ${beachName}` : undefined,
    createdAt: row.created_at,
    moderationStatus: row.moderation_status === 'hidden' ? 'hidden' : 'visible',
    moderatedAt: row.moderated_at ?? undefined,
    helpfulCount: helpfulLoadError ? null : (helpfulSummary?.helpfulCount ?? 0),
    viewerHasReacted: helpfulLoadError
      ? false
      : (helpfulSummary?.viewerHasReacted ?? false),
    helpfulLoadError,
    viewerHasFlagged,
  };
}

export async function getReportHelpfulSummaries(
  reportIds: string[]
): Promise<Map<string, HelpfulReactionSummary>> {
  const map = new Map<string, HelpfulReactionSummary>();
  const uniqueIds = Array.from(
    new Set(reportIds.map((id) => id.trim()).filter(Boolean))
  );

  if (uniqueIds.length === 0) {
    return map;
  }

  if (!supabase) {
    throw new Error('Conexão com o Supabase não configurada.');
  }

  for (let i = 0; i < uniqueIds.length; i += MAX_HELPFUL_SUMMARY_BATCH) {
    const batch = uniqueIds.slice(i, i + MAX_HELPFUL_SUMMARY_BATCH);
    const { data, error } = await supabase.rpc('get_beach_report_helpful_summary', {
      p_report_ids: batch,
    });

    if (error || !Array.isArray(data)) {
      throw new Error('Não foi possível carregar as marcações de "Foi útil" agora.');
    }

    for (const rawRow of data as HelpfulSummaryRpcRow[]) {
      if (!rawRow?.report_id) continue;
      const numericCount = Number(rawRow.helpful_count ?? 0);
      map.set(rawRow.report_id, {
        reportId: rawRow.report_id,
        helpfulCount: Number.isFinite(numericCount)
          ? Math.max(0, Math.round(numericCount))
          : 0,
        viewerHasReacted: Boolean(rawRow.viewer_has_reacted),
      });
    }
  }

  return map;
}

async function tryGetSingleHelpfulSummary(
  reportId: string
): Promise<HelpfulReactionSummary | undefined> {
  try {
    const map = await getReportHelpfulSummaries([reportId]);
    return map.get(reportId);
  } catch {
    return undefined;
  }
}

export async function markReportHelpful(
  reportId: string
): Promise<HelpfulReactionSummary> {
  if (!supabase) {
    throw new HelpfulReactionMutationError('Conexão com o Supabase não configurada.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const sessionUser = sessionData.session?.user;

  if (sessionError || !sessionUser) {
    throw new HelpfulReactionMutationError(
      'Entre com sua conta Google para marcar um relato como útil.'
    );
  }

  const { error: insertError } = await supabase
    .from('beach_report_helpful_reactions')
    .insert({
      report_id: reportId,
      user_id: sessionUser.id,
    });

  // 23505 = chave única já existente -> trata repetição de forma idempotente
  if (insertError && insertError.code !== '23505') {
    const reconciled = await tryGetSingleHelpfulSummary(reportId);

    if (insertError.code === '42501') {
      throw new HelpfulReactionMutationError(
        reconciled
          ? 'Não é possível marcar o próprio relato como útil.'
          : 'Este relato não está mais disponível para marcações.',
        reconciled
      );
    }

    if (insertError.code === 'P0002') {
      throw new HelpfulReactionMutationError(
        'Este relato não está mais disponível.',
        reconciled
      );
    }

    if (reconciled?.viewerHasReacted) {
      return reconciled;
    }

    throw new HelpfulReactionMutationError(
      'Não foi possível marcar o relato como útil agora. Tente novamente.',
      reconciled
    );
  }

  try {
    const map = await getReportHelpfulSummaries([reportId]);
    const confirmed = map.get(reportId);
    if (!confirmed) {
      throw new HelpfulReactionMutationError('Relato não encontrado para confirmar a reação.');
    }
    return confirmed;
  } catch (err) {
    if (err instanceof HelpfulReactionMutationError) {
      throw err;
    }
    throw new HelpfulReactionMutationError(
      'A marcação foi enviada, mas não foi possível confirmar o contador agora. Tente atualizar.'
    );
  }
}

export async function unmarkReportHelpful(
  reportId: string
): Promise<HelpfulReactionSummary> {
  if (!supabase) {
    throw new HelpfulReactionMutationError('Conexão com o Supabase não configurada.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const sessionUser = sessionData.session?.user;

  if (sessionError || !sessionUser) {
    throw new HelpfulReactionMutationError(
      'Entre com sua conta Google para remover sua marcação.'
    );
  }

  const { error: deleteError } = await supabase
    .from('beach_report_helpful_reactions')
    .delete()
    .eq('report_id', reportId)
    .eq('user_id', sessionUser.id);

  if (deleteError) {
    const reconciled = await tryGetSingleHelpfulSummary(reportId);

    if (reconciled && !reconciled.viewerHasReacted) {
      return reconciled;
    }

    throw new HelpfulReactionMutationError(
      'Não foi possível remover sua marcação agora. Tente novamente.',
      reconciled
    );
  }

  try {
    const map = await getReportHelpfulSummaries([reportId]);
    const confirmed = map.get(reportId);
    if (!confirmed) {
      throw new HelpfulReactionMutationError('Relato não encontrado para confirmar a remoção.');
    }
    return confirmed;
  } catch (err) {
    if (err instanceof HelpfulReactionMutationError) {
      throw err;
    }
    throw new HelpfulReactionMutationError(
      'A remoção foi enviada, mas não foi possível confirmar o contador agora. Tente atualizar.'
    );
  }
}

interface FetchReportsOptions {
  page?: number;
  pageSize?: number;
  beachId?: string;
  userId?: string;
  onlyVisible?: boolean;
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

  if (options.onlyVisible) {
    query = query.eq('moderation_status', 'visible');
  }

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
  const reportIds = rows.map((row) => row.id);

  let helpfulMap = new Map<string, HelpfulReactionSummary>();
  let helpfulLoadError = false;
  let flaggedSet = new Set<string>();

  if (reportIds.length > 0) {
    const [helpfulOutcome, flaggedOutcome] = await Promise.allSettled([
      getReportHelpfulSummaries(reportIds),
      getMyFlaggedReportIds(reportIds),
    ]);

    if (helpfulOutcome.status === 'fulfilled') {
      helpfulMap = helpfulOutcome.value;
    } else {
      helpfulLoadError = true;
    }

    if (flaggedOutcome.status === 'fulfilled') {
      flaggedSet = flaggedOutcome.value;
    }
  }

  const items = rows.map((row) =>
    mapSupabaseReport(
      row,
      undefined,
      helpfulMap.get(row.id),
      helpfulLoadError,
      flaggedSet.has(row.id)
    )
  );
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
  return fetchPaginatedReports({ ...options, onlyVisible: true });
}

export async function getReportsByBeach(
  beachId: string,
  options: { page?: number; pageSize?: number } = {}
): Promise<PaginatedReportsResult> {
  return fetchPaginatedReports({ ...options, beachId, onlyVisible: true });
}

export async function getReportsByUser(
  userId: string,
  options: { page?: number; pageSize?: number } = {}
): Promise<PaginatedReportsResult> {
  return fetchPaginatedReports({ ...options, userId });
}

export async function getPublicReportsByUser(
  userId: string,
  options: { page?: number; pageSize?: number } = {}
): Promise<PaginatedReportsResult> {
  return fetchPaginatedReports({ ...options, userId, onlyVisible: true });
}

export async function getUserEvaluatedBeachesCount(userId: string): Promise<number> {
  const stats = await getPublicProfileStats(userId);
  return stats.evaluatedBeachesCount;
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
  const initialSummary: HelpfulReactionSummary = {
    reportId: baseRow.id,
    helpfulCount: 0,
    viewerHasReacted: false,
  };

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('beach_reports')
        .select(REPORT_SELECT)
        .eq('id', baseRow.id)
        .single();

      if (!error && data) {
        return mapSupabaseReport(
          data as SupabaseBeachReportRow,
          fallbackDisplay,
          initialSummary,
          false
        );
      }
    } catch {
      // Se a consulta secundária de exibição falhar, o relato já foi gravado e
      // retornamos os dados confirmados do INSERT com fallback de exibição.
    }
  }

  return mapSupabaseReport(baseRow, fallbackDisplay, initialSummary, false);
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
