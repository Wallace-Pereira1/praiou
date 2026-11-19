import { supabase } from '../lib/supabase';
import type {
  BeachReportReply,
  CreateReplyFallbackAuthor,
  CreateReplyPayload,
  PaginatedRepliesResult,
} from '../types';
import { generateReportUuid } from '../utils/reportImage';
import { getMyFlaggedReplyIds } from './moderation';
import { resolveProfileAvatarUrl } from './profiles';

export const DEFAULT_REPLIES_PAGE_SIZE = 20;
export const MAX_REPLY_LENGTH = 500;
const MAX_REPLY_SUMMARY_BATCH = 50;
const REPLY_DRAFT_KEY_PREFIX = 'praiou_reply_draft:';

export class ReplyPublishError extends Error {
  readonly ambiguous: boolean;
  readonly code?: string;

  constructor(
    message: string,
    options: { ambiguous?: boolean; code?: string } = {}
  ) {
    super(message);
    this.name = 'ReplyPublishError';
    this.ambiguous = Boolean(options.ambiguous);
    this.code = options.code;
  }
}

interface JoinedReplyProfileRow {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  avatar_path: string | null;
}

interface BaseReplyRow {
  id: string;
  report_id: string;
  user_id: string;
  body: string;
  moderation_status: string;
  created_at: string;
}

interface SupabaseReplyRow extends BaseReplyRow {
  profiles?: JoinedReplyProfileRow | JoinedReplyProfileRow[] | null;
}

interface ReplySummaryRpcRow {
  report_id: string;
  reply_count: number | string | null;
}

const BASE_REPLY_SELECT =
  'id, report_id, user_id, body, moderation_status, created_at';

const REPLY_SELECT = `
  id,
  report_id,
  user_id,
  body,
  moderation_status,
  created_at,
  profiles:user_id (
    id,
    display_name,
    username,
    avatar_url,
    avatar_path
  )
`;

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapSupabaseReply(
  row: SupabaseReplyRow,
  fallbackAuthor?: CreateReplyFallbackAuthor,
  viewerHasFlagged = false
): BeachReportReply {
  const profile = unwrapRelation(row.profiles);

  return {
    id: row.id,
    reportId: row.report_id,
    userId: row.user_id,
    userName:
      profile?.display_name?.trim() ||
      fallbackAuthor?.userName?.trim() ||
      'Banhista',
    userUsername:
      profile?.username?.trim() ||
      fallbackAuthor?.userUsername?.trim() ||
      undefined,
    userAvatarUrl:
      resolveProfileAvatarUrl(profile?.avatar_path, profile?.avatar_url) ??
      fallbackAuthor?.userAvatarUrl,
    body: row.body ?? '',
    moderationStatus: row.moderation_status === 'hidden' ? 'hidden' : 'visible',
    createdAt: row.created_at,
    viewerHasFlagged,
  };
}

export function getReplyDraft(reportId: string): string {
  if (!reportId) return '';
  try {
    return sessionStorage.getItem(`${REPLY_DRAFT_KEY_PREFIX}${reportId}`) ?? '';
  } catch {
    return '';
  }
}

export function saveReplyDraft(reportId: string, body: string): void {
  if (!reportId) return;
  try {
    const key = `${REPLY_DRAFT_KEY_PREFIX}${reportId}`;
    if (body.length === 0) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, body.slice(0, MAX_REPLY_LENGTH));
    }
  } catch {
    // Ignora falhas de acesso ao sessionStorage
  }
}

export function clearReplyDraft(reportId: string): void {
  if (!reportId) return;
  try {
    sessionStorage.removeItem(`${REPLY_DRAFT_KEY_PREFIX}${reportId}`);
  } catch {
    // Ignora falhas de acesso ao sessionStorage
  }
}

export function clearAllReplyDrafts(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(REPLY_DRAFT_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      sessionStorage.removeItem(key);
    }
  } catch {
    // Ignora falhas de acesso ao sessionStorage
  }
}

export async function getReportReplySummaries(
  reportIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const uniqueIds = Array.from(
    new Set(reportIds.map((id) => id.trim()).filter(Boolean))
  );

  if (uniqueIds.length === 0) {
    return map;
  }

  if (!supabase) {
    throw new Error('Conexão com o Supabase não configurada.');
  }

  for (let i = 0; i < uniqueIds.length; i += MAX_REPLY_SUMMARY_BATCH) {
    const batch = uniqueIds.slice(i, i + MAX_REPLY_SUMMARY_BATCH);
    const { data, error } = await supabase.rpc('get_beach_report_reply_summary', {
      p_report_ids: batch,
    });

    if (error || !Array.isArray(data)) {
      throw new Error('Não foi possível carregar as contagens de respostas agora.');
    }

    for (const rawRow of data as ReplySummaryRpcRow[]) {
      if (!rawRow?.report_id) continue;
      const numericCount = Number(rawRow.reply_count ?? 0);
      map.set(
        rawRow.report_id,
        Number.isFinite(numericCount) ? Math.max(0, Math.round(numericCount)) : 0
      );
    }
  }

  return map;
}

export async function getRepliesByReport(
  reportId: string,
  options: { offset?: number; pageSize?: number } = {}
): Promise<PaginatedRepliesResult> {
  if (!supabase) {
    throw new Error('Conexão com o Supabase não configurada.');
  }

  const safeOffset = Math.max(0, options.offset ?? 0);
  const safePageSize = Math.max(
    1,
    Math.min(50, options.pageSize ?? DEFAULT_REPLIES_PAGE_SIZE)
  );
  const to = safeOffset + safePageSize - 1;

  const listPromise = supabase
    .from('beach_report_replies')
    .select(REPLY_SELECT, { count: 'exact' })
    .eq('report_id', reportId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(safeOffset, to);

  const summaryPromise =
    safeOffset === 0 ? getReportReplySummaries([reportId]) : Promise.resolve(null);

  const [listOutcome, summaryOutcome] = await Promise.allSettled([
    listPromise,
    summaryPromise,
  ]);

  if (listOutcome.status !== 'fulfilled') {
    throw new Error('Não foi possível carregar as respostas agora.');
  }

  const { data, error, count } = listOutcome.value;
  if (error) {
    throw new Error('Não foi possível carregar as respostas agora.');
  }

  const rows = (data ?? []) as SupabaseReplyRow[];
  const replyIds = rows.map((row) => row.id);

  let flaggedSet = new Set<string>();
  if (replyIds.length > 0) {
    try {
      flaggedSet = await getMyFlaggedReplyIds(replyIds);
    } catch {
      flaggedSet = new Set();
    }
  }

  const items = rows.map((row) =>
    mapSupabaseReply(row, undefined, flaggedSet.has(row.id))
  );
  const totalCount = typeof count === 'number' ? count : safeOffset + items.length;
  const visibleFallback = items.filter((r) => r.moderationStatus === 'visible').length;
  const visibleCount =
    summaryOutcome.status === 'fulfilled' && summaryOutcome.value !== null
      ? (summaryOutcome.value.get(reportId) ?? 0)
      : totalCount > 0
        ? Math.max(visibleFallback, totalCount)
        : 0;

  return {
    items,
    totalCount,
    visibleCount,
    hasMore: safeOffset + items.length < totalCount,
    nextOffset: safeOffset + items.length,
  };
}

type CheckReplyResult =
  | { status: 'found'; row: BaseReplyRow }
  | { status: 'not_found' }
  | { status: 'error' };

async function checkReplyById(replyId: string): Promise<CheckReplyResult> {
  if (!supabase) {
    return { status: 'error' };
  }

  try {
    const { data, error } = await supabase
      .from('beach_report_replies')
      .select(BASE_REPLY_SELECT)
      .eq('id', replyId)
      .maybeSingle();

    if (error) {
      return { status: 'error' };
    }

    if (data) {
      return { status: 'found', row: data as BaseReplyRow };
    }

    return { status: 'not_found' };
  } catch {
    return { status: 'error' };
  }
}

async function enrichReplyForDisplay(
  baseRow: BaseReplyRow,
  fallbackAuthor?: CreateReplyFallbackAuthor
): Promise<BeachReportReply> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('beach_report_replies')
        .select(REPLY_SELECT)
        .eq('id', baseRow.id)
        .single();

      if (!error && data) {
        return mapSupabaseReply(data as SupabaseReplyRow, fallbackAuthor, false);
      }
    } catch {
      // Se a leitura secundária falhar, retorna a resposta confirmada com fallback do autor
    }
  }

  return mapSupabaseReply(baseRow, fallbackAuthor, false);
}

export async function createReportReply(
  payload: CreateReplyPayload
): Promise<BeachReportReply> {
  if (!supabase) {
    throw new ReplyPublishError('Conexão com o Supabase não configurada.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const sessionUser = sessionData.session?.user;

  if (sessionError || !sessionUser) {
    throw new ReplyPublishError('Entre com sua conta Google para responder.');
  }

  const trimmedBody = payload.body.trim();
  if (trimmedBody.length === 0) {
    throw new ReplyPublishError('Escreva uma resposta antes de enviar.');
  }
  if (trimmedBody.length > MAX_REPLY_LENGTH) {
    throw new ReplyPublishError(
      `A resposta deve ter no máximo ${MAX_REPLY_LENGTH} caracteres.`
    );
  }

  const replyId = payload.replyId?.trim().toLowerCase() || generateReportUuid();

  let rpcData: unknown = null;
  let rpcError: { code?: string; message?: string } | null = null;

  try {
    const response = await supabase.rpc('create_beach_report_reply', {
      p_report_id: payload.reportId,
      p_body: trimmedBody,
      p_reply_id: replyId,
    });
    rpcData = response.data;
    rpcError = response.error;
  } catch {
    rpcError = { message: 'network_error' };
  }

  if (rpcError) {
    const code = rpcError.code;

    if (code === 'P0001') {
      throw new ReplyPublishError(
        'Você atingiu o limite inicial de 10 respostas a cada 10 minutos. Aguarde um instante antes de publicar novamente.',
        { ambiguous: false, code }
      );
    }

    if (code === 'P0002') {
      throw new ReplyPublishError(
        'Este relato não está mais disponível para novas respostas.',
        { ambiguous: false, code }
      );
    }

    if (code === '42501') {
      throw new ReplyPublishError(
        rpcError.message || 'Entre com sua conta Google para responder.',
        { ambiguous: false, code }
      );
    }

    if (code === '22023') {
      throw new ReplyPublishError(
        rpcError.message || `A resposta deve ter entre 1 e ${MAX_REPLY_LENGTH} caracteres.`,
        { ambiguous: false, code }
      );
    }

    // Falha de rede/timeout ou erro sem código determinístico: verifica idempotência pelo p_reply_id
    const checkResult = await checkReplyById(replyId);
    if (checkResult.status === 'found') {
      return enrichReplyForDisplay(checkResult.row, payload.fallbackAuthor);
    }

    if (checkResult.status === 'error') {
      throw new ReplyPublishError(
        'A conexão falhou ao confirmar sua resposta. Tente novamente para concluir sem duplicar.',
        { ambiguous: true, code }
      );
    }

    throw new ReplyPublishError(
      'Não foi possível publicar sua resposta agora. Verifique sua conexão e tente novamente.',
      { ambiguous: false, code }
    );
  }

  const insertedRow = Array.isArray(rpcData)
    ? (rpcData[0] as BaseReplyRow | undefined)
    : undefined;

  if (!insertedRow) {
    const checkResult = await checkReplyById(replyId);
    if (checkResult.status === 'found') {
      return enrichReplyForDisplay(checkResult.row, payload.fallbackAuthor);
    }

    throw new ReplyPublishError(
      'Não foi possível confirmar a gravação da resposta. Tente novamente.',
      { ambiguous: checkResult.status === 'error' }
    );
  }

  return enrichReplyForDisplay(insertedRow, payload.fallbackAuthor);
}

export async function deleteReportReply(replyId: string): Promise<void> {
  if (!supabase) {
    throw new Error('Conexão com o Supabase não configurada.');
  }

  const { data, error } = await supabase
    .from('beach_report_replies')
    .delete()
    .eq('id', replyId)
    .select('id');

  if (error) {
    throw new Error('Não foi possível excluir a resposta agora. Tente novamente.');
  }

  const deletedRow = (data as Array<{ id?: string }> | null)?.[0];
  if (!deletedRow || deletedRow.id !== replyId) {
    throw new Error(
      'Resposta não encontrada ou você não tem permissão para excluí-la.'
    );
  }
}
