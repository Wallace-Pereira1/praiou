import { supabase } from '../lib/supabase';
import type {
  BeachReport,
  CreateReportPayload,
  PaginatedReportsResult,
} from '../types';

export const DEFAULT_REPORTS_PAGE_SIZE = 20;

interface JoinedProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface JoinedBeachRow {
  id: string;
  slug: string;
  name: string;
}

interface SupabaseBeachReportRow {
  id: string;
  beach_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  profiles?: JoinedProfileRow | JoinedProfileRow[] | null;
  beaches?: JoinedBeachRow | JoinedBeachRow[] | null;
}

const REPORT_SELECT = `
  id,
  beach_id,
  user_id,
  rating,
  comment,
  created_at,
  profiles:user_id (
    id,
    display_name,
    avatar_url
  ),
  beaches:beach_id (
    id,
    slug,
    name
  )
`;

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeRating(raw: number): 1 | 2 | 3 | 4 | 5 {
  if (raw <= 1) return 1;
  if (raw >= 5) return 5;
  return Math.round(raw) as 1 | 2 | 3 | 4 | 5;
}

function mapSupabaseReport(row: SupabaseBeachReportRow): BeachReport {
  const profile = unwrapRelation(row.profiles);
  const beach = unwrapRelation(row.beaches);

  return {
    id: row.id,
    beachId: row.beach_id,
    beachSlug: beach?.slug ?? '',
    beachName: beach?.name ?? 'Praia do Rio',
    userId: row.user_id,
    userName: profile?.display_name?.trim() || 'Banhista',
    userAvatarUrl: profile?.avatar_url?.trim() || undefined,
    rating: normalizeRating(Number(row.rating)),
    comment: row.comment ?? '',
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
  const pageSize = Math.max(1, Math.min(50, options.pageSize ?? DEFAULT_REPORTS_PAGE_SIZE));
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
  const items = rows.map(mapSupabaseReport);
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

export async function createReport(
  payload: CreateReportPayload
): Promise<BeachReport> {
  if (!supabase) {
    throw new Error('Conexão com o Supabase não configurada.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const sessionUser = sessionData.session?.user;

  if (sessionError || !sessionUser) {
    throw new Error('Entre com sua conta Google para publicar um relato.');
  }

  const trimmedComment = payload.comment?.trim() ?? '';
  if (trimmedComment.length > 180) {
    throw new Error('O comentário deve ter no máximo 180 caracteres.');
  }

  const { data, error } = await supabase
    .from('beach_reports')
    .insert({
      beach_id: payload.beachId,
      user_id: sessionUser.id,
      rating: payload.rating,
      comment: trimmedComment.length > 0 ? trimmedComment : null,
    })
    .select(REPORT_SELECT)
    .single();

  if (error || !data) {
    throw new Error(
      'Não foi possível publicar seu relato no banco. Verifique sua conexão e tente novamente.'
    );
  }

  return mapSupabaseReport(data as SupabaseBeachReportRow);
}

export async function deleteReport(reportId: string): Promise<void> {
  if (!supabase) {
    throw new Error('Conexão com o Supabase não configurada.');
  }

  const { data, error } = await supabase
    .from('beach_reports')
    .delete()
    .eq('id', reportId)
    .select('id');

  if (error) {
    throw new Error('Não foi possível excluir o relato agora. Tente novamente.');
  }

  if (!data || data.length === 0) {
    throw new Error('Relato não encontrado ou você não tem permissão para excluí-lo.');
  }
}
