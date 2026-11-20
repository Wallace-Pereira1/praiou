import { supabase } from '../lib/supabase';
import type {
  ModerationAction,
  ModerationFlagItem,
  ModerationLogItem,
  ModerationQueueFilter,
  ModerationQueueResult,
  ModerationReasonCount,
  ModerationRepliesQueueResult,
  ModerationReplyItem,
  ModerationReportItem,
  ReportFlagReason,
  ReportFlagStatus,
} from '../types';
import {
  normalizeCrowdLevel,
  normalizePostCode,
  normalizeSeaCondition,
  normalizeSkyCondition,
} from '../utils/reportConditions';
import { resolveProfileAvatarUrl } from './profiles';
import { getReportPhotoPublicUrl } from './reports';

export const DEFAULT_MODERATION_PAGE_SIZE = 10;
export const MAX_FLAG_DETAILS_LENGTH = 500;
export const MAX_MODERATION_REASON_LENGTH = 500;

export const REPORT_FLAG_REASONS: ReadonlyArray<{
  value: ReportFlagReason;
  label: string;
  description: string;
}> = [
  {
    value: 'spam',
    label: 'Spam ou propaganda',
    description: 'Divulgação comercial, links repetidos ou conteúdo fora de contexto.',
  },
  {
    value: 'harassment',
    label: 'Ofensa, assédio ou discriminação',
    description: 'Ataques pessoais, xingamentos ou discurso discriminatório.',
  },
  {
    value: 'inappropriate_media',
    label: 'Foto ou conteúdo inadequado',
    description: 'Imagem ou texto impróprio para um guia comunitário de praias.',
  },
  {
    value: 'personal_data',
    label: 'Exposição de dados pessoais',
    description: 'Telefone, documento, endereço, placa ou dados privados de terceiros.',
  },
  {
    value: 'misleading_or_dangerous',
    label: 'Informação enganosa ou perigosa',
    description: 'Relato falso que induza a risco na orla ou no mar.',
  },
  {
    value: 'other',
    label: 'Outro',
    description: 'Descreva abaixo o motivo da denúncia.',
  },
];

const FLAG_REASON_LABELS: Record<ReportFlagReason, string> = {
  spam: 'Spam ou propaganda',
  harassment: 'Ofensa, assédio ou discriminação',
  inappropriate_media: 'Foto ou conteúdo inadequado',
  personal_data: 'Exposição de dados pessoais',
  misleading_or_dangerous: 'Informação enganosa ou perigosa',
  other: 'Outro',
};

const FLAG_STATUS_LABELS: Record<ReportFlagStatus, string> = {
  pending: 'Pendente',
  resolved_kept: 'Encerrada · Publicação mantida',
  resolved_hidden: 'Encerrada · Publicação ocultada',
};

const MODERATION_ACTION_LABELS: Record<ModerationAction, string> = {
  keep_visible: 'Publicação mantida e denúncias encerradas',
  hide: 'Publicação ocultada',
  restore: 'Publicação restaurada',
};

export function getFlagReasonLabel(reason: ReportFlagReason): string {
  return FLAG_REASON_LABELS[reason] ?? 'Outro';
}

export function getFlagStatusLabel(status: ReportFlagStatus): string {
  return FLAG_STATUS_LABELS[status] ?? status;
}

export function getModerationActionLabel(action: ModerationAction): string {
  return MODERATION_ACTION_LABELS[action] ?? action;
}

export class ReportFlagError extends Error {
  readonly code?: string;
  readonly alreadyFlagged?: boolean;

  constructor(
    message: string,
    options: { code?: string; alreadyFlagged?: boolean } = {}
  ) {
    super(message);
    this.name = 'ReportFlagError';
    this.code = options.code;
    this.alreadyFlagged = options.alreadyFlagged;
  }
}

export class ModerationUnauthorizedError extends Error {
  constructor(message = 'Acesso restrito à moderação.') {
    super(message);
    this.name = 'ModerationUnauthorizedError';
  }
}

export class ModerationConflictError extends Error {
  constructor(
    message = 'Este relato foi atualizado por outro moderador ou recebeu novas denúncias. Atualize a fila para conferir.'
  ) {
    super(message);
    this.name = 'ModerationConflictError';
  }
}

export async function checkIsCurrentUserModerator(): Promise<boolean> {
  if (!supabase) return false;

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) {
    return false;
  }

  const { data, error } = await supabase.rpc('is_current_user_moderator');
  if (error) {
    return false;
  }

  return data === true;
}

export async function getMyFlaggedReportIds(
  reportIds: string[]
): Promise<Set<string>> {
  const flaggedSet = new Set<string>();
  const uniqueIds = Array.from(
    new Set(reportIds.map((id) => id.trim()).filter(Boolean))
  );

  if (!supabase || uniqueIds.length === 0) {
    return flaggedSet;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (sessionError || !userId) {
    return flaggedSet;
  }

  const { data, error } = await supabase
    .from('beach_report_flags')
    .select('report_id')
    .eq('reporter_id', userId)
    .in('report_id', uniqueIds);

  if (error || !Array.isArray(data)) {
    return flaggedSet;
  }

  for (const row of data as Array<{ report_id?: string | null }>) {
    if (row.report_id) {
      flaggedSet.add(row.report_id);
    }
  }

  return flaggedSet;
}

export async function submitReportFlag(params: {
  reportId: string;
  reason: ReportFlagReason;
  details?: string;
}): Promise<void> {
  if (!supabase) {
    throw new ReportFlagError('Conexão com o Supabase não configurada.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) {
    throw new ReportFlagError(
      'Entre com sua conta Google para enviar uma denúncia.'
    );
  }

  const trimmedDetails = params.details?.trim() ?? '';
  if (trimmedDetails.length > MAX_FLAG_DETAILS_LENGTH) {
    throw new ReportFlagError(
      `A observação deve ter no máximo ${MAX_FLAG_DETAILS_LENGTH} caracteres.`
    );
  }

  if (params.reason === 'other' && trimmedDetails.length === 0) {
    throw new ReportFlagError('Descreva o motivo da denúncia em “Outro”.');
  }

  const { data, error } = await supabase.rpc('submit_beach_report_flag', {
    p_report_id: params.reportId,
    p_reason: params.reason,
    p_details: trimmedDetails.length > 0 ? trimmedDetails : null,
  });

  if (error) {
    const code = error.code;

    if (code === '23505') {
      throw new ReportFlagError('Você já denunciou este relato anteriormente.', {
        code,
        alreadyFlagged: true,
      });
    }

    if (code === 'P0001') {
      throw new ReportFlagError(
        'Você atingiu o limite inicial de 5 denúncias por hora. Tente novamente mais tarde.',
        { code }
      );
    }

    if (code === 'P0002') {
      throw new ReportFlagError(
        'Este relato não está mais disponível para denúncia.',
        { code }
      );
    }

    if (code === '42501') {
      throw new ReportFlagError(
        error.message || 'Não é possível denunciar este relato.',
        { code }
      );
    }

    if (code === '22023') {
      throw new ReportFlagError(
        error.message || 'Verifique o motivo e a observação informados.',
        { code }
      );
    }

    throw new ReportFlagError(
      'Não foi possível registrar sua denúncia agora. Verifique sua conexão e tente novamente.',
      { code }
    );
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new ReportFlagError(
      'Não foi possível confirmar o registro da denúncia no servidor.'
    );
  }
}

interface RawModerationQueuePayload {
  filter?: string;
  page?: number;
  pageSize?: number;
  totalCount?: number;
  pendingReportsCount?: number;
  resolvedReportsCount?: number;
  hasMore?: boolean;
  items?: RawModerationReportItem[];
}

interface RawModerationReportItem {
  reportId: string;
  beachId: string;
  beachSlug: string;
  beachName: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  authorAvatarPath?: string | null;
  rating?: number | null;
  postCode?: string | null;
  skyCondition?: string | null;
  seaCondition?: string | null;
  crowdLevel?: string | null;
  comment?: string | null;
  photoPath?: string | null;
  reportCreatedAt: string;
  moderationStatus: 'visible' | 'hidden';
  moderatedAt?: string | null;
  pendingFlagsCount?: number;
  totalFlagsCount?: number;
  latestFlagAt?: string | null;
  helpfulCount?: number;
  reasonSummary?: ModerationReasonCount[];
  flags?: Array<{
    id: string;
    reason: ReportFlagReason;
    details?: string | null;
    status: ReportFlagStatus;
    createdAt: string;
    reporterName: string;
  }>;
  logs?: Array<{
    id: string;
    action: ModerationAction;
    reason?: string | null;
    flagsResolvedCount?: number;
    createdAt: string;
    moderatorName: string;
  }>;
}

function normalizeRating(
  raw: number | null | undefined
): 1 | 2 | 3 | 4 | 5 | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (raw <= 1) return 1;
  if (raw >= 5) return 5;
  return Math.round(raw) as 1 | 2 | 3 | 4 | 5;
}

function mapModerationItem(raw: RawModerationReportItem): ModerationReportItem {
  const photoPath = raw.photoPath?.trim() || undefined;
  const photoUrl = getReportPhotoPublicUrl(photoPath);

  const flags: ModerationFlagItem[] = Array.isArray(raw.flags)
    ? raw.flags.map((f) => ({
        id: f.id,
        reason: f.reason,
        details: f.details?.trim() || undefined,
        status: f.status,
        createdAt: f.createdAt,
        reporterName: f.reporterName?.trim() || 'Banhista',
      }))
    : [];

  const logs: ModerationLogItem[] = Array.isArray(raw.logs)
    ? raw.logs.map((l) => ({
        id: l.id,
        action: l.action,
        reason: l.reason?.trim() || undefined,
        flagsResolvedCount: Number(l.flagsResolvedCount ?? 0),
        createdAt: l.createdAt,
        moderatorName: l.moderatorName?.trim() || 'Moderador',
      }))
    : [];

  return {
    reportId: raw.reportId,
    beachId: raw.beachId,
    beachSlug: raw.beachSlug,
    beachName: raw.beachName,
    authorId: raw.authorId,
    authorName: raw.authorName?.trim() || 'Banhista',
    authorAvatarUrl: resolveProfileAvatarUrl(
      raw.authorAvatarPath,
      raw.authorAvatarUrl
    ),
    rating: normalizeRating(raw.rating),
    postCode: normalizePostCode(raw.postCode),
    skyCondition: normalizeSkyCondition(raw.skyCondition),
    seaCondition: normalizeSeaCondition(raw.seaCondition),
    crowdLevel: normalizeCrowdLevel(raw.crowdLevel),
    comment: raw.comment ?? '',
    photoPath,
    photoUrl,
    reportCreatedAt: raw.reportCreatedAt,
    moderationStatus: raw.moderationStatus === 'hidden' ? 'hidden' : 'visible',
    moderatedAt: raw.moderatedAt ?? undefined,
    pendingFlagsCount: Number(raw.pendingFlagsCount ?? 0),
    totalFlagsCount: Number(raw.totalFlagsCount ?? flags.length),
    latestFlagAt: raw.latestFlagAt ?? undefined,
    helpfulCount: Math.max(0, Number(raw.helpfulCount ?? 0)),
    reasonSummary: Array.isArray(raw.reasonSummary) ? raw.reasonSummary : [],
    flags,
    logs,
  };
}

export async function getModerationQueue(params: {
  filter: ModerationQueueFilter;
  page?: number;
  pageSize?: number;
}): Promise<ModerationQueueResult> {
  if (!supabase) {
    throw new Error('Conexão com o Supabase não configurada.');
  }

  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(25, Math.max(1, params.pageSize ?? DEFAULT_MODERATION_PAGE_SIZE));

  const { data, error } = await supabase.rpc('get_moderation_reports', {
    p_filter: params.filter,
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) {
    if (error.code === '42501') {
      throw new ModerationUnauthorizedError(
        'Sua conta não tem permissão de moderação.'
      );
    }
    throw new Error('Não foi possível carregar a fila de moderação agora.');
  }

  const payload = (data ?? {}) as RawModerationQueuePayload;
  const rawItems = Array.isArray(payload.items) ? payload.items : [];

  return {
    filter: payload.filter === 'resolved' ? 'resolved' : 'pending',
    page: Number(payload.page ?? page),
    pageSize: Number(payload.pageSize ?? pageSize),
    totalCount: Number(payload.totalCount ?? 0),
    pendingReportsCount: Number(payload.pendingReportsCount ?? 0),
    resolvedReportsCount: Number(payload.resolvedReportsCount ?? 0),
    hasMore: Boolean(payload.hasMore),
    items: rawItems.map(mapModerationItem),
  };
}

export async function moderateReport(params: {
  reportId: string;
  action: ModerationAction;
  reason?: string;
  expectedModerationStatus: 'visible' | 'hidden';
  expectedPendingCount: number;
}): Promise<{
  reportId: string;
  action: ModerationAction;
  moderationStatus: 'visible' | 'hidden';
  moderatedAt: string;
  flagsResolvedCount: number;
}> {
  if (!supabase) {
    throw new Error('Conexão com o Supabase não configurada.');
  }

  const trimmedReason = params.reason?.trim() ?? '';
  if (trimmedReason.length > MAX_MODERATION_REASON_LENGTH) {
    throw new Error(
      `A justificativa deve ter no máximo ${MAX_MODERATION_REASON_LENGTH} caracteres.`
    );
  }

  if (
    (params.action === 'hide' || params.action === 'restore') &&
    trimmedReason.length === 0
  ) {
    throw new Error(
      'Informe uma justificativa para ocultar ou restaurar a publicação.'
    );
  }

  const { data, error } = await supabase.rpc('moderate_beach_report', {
    p_report_id: params.reportId,
    p_action: params.action,
    p_reason: trimmedReason.length > 0 ? trimmedReason : null,
    p_expected_moderation_status: params.expectedModerationStatus,
    p_expected_pending_count: params.expectedPendingCount,
  });

  if (error) {
    if (error.code === '42501') {
      throw new ModerationUnauthorizedError(
        'Sua conta não tem permissão para executar ações de moderação.'
      );
    }

    if (error.code === '40001') {
      throw new ModerationConflictError(
        error.message ||
          'Este relato já recebeu outra decisão ou novas denúncias. Atualize a fila.'
      );
    }

    if (error.code === 'P0002') {
      throw new ModerationConflictError(
        'Este relato não foi encontrado ou foi excluído pelo próprio autor.'
      );
    }

    if (error.code === '22023') {
      throw new Error(error.message || 'Dados inválidos para a decisão.');
    }

    throw new Error('Não foi possível registrar a decisão de moderação agora.');
  }

  const result = (data ?? {}) as {
    reportId: string;
    action: ModerationAction;
    moderationStatus: 'visible' | 'hidden';
    moderatedAt: string;
    flagsResolvedCount: number;
  };

  return {
    reportId: result.reportId,
    action: result.action,
    moderationStatus: result.moderationStatus,
    moderatedAt: result.moderatedAt,
    flagsResolvedCount: Number(result.flagsResolvedCount ?? 0),
  };
}

export async function getMyFlaggedReplyIds(
  replyIds: string[]
): Promise<Set<string>> {
  const flaggedSet = new Set<string>();
  const uniqueIds = Array.from(
    new Set(replyIds.map((id) => id.trim()).filter(Boolean))
  );

  if (!supabase || uniqueIds.length === 0) {
    return flaggedSet;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (sessionError || !userId) {
    return flaggedSet;
  }

  const { data, error } = await supabase
    .from('beach_report_reply_flags')
    .select('reply_id')
    .eq('reporter_id', userId)
    .in('reply_id', uniqueIds);

  if (error || !Array.isArray(data)) {
    return flaggedSet;
  }

  for (const row of data as Array<{ reply_id?: string | null }>) {
    if (row.reply_id) {
      flaggedSet.add(row.reply_id);
    }
  }

  return flaggedSet;
}

export async function submitReplyFlag(params: {
  replyId: string;
  reason: ReportFlagReason;
  details?: string;
}): Promise<void> {
  if (!supabase) {
    throw new ReportFlagError('Conexão com o Supabase não configurada.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) {
    throw new ReportFlagError(
      'Entre com sua conta Google para enviar uma denúncia.'
    );
  }

  const trimmedDetails = params.details?.trim() ?? '';
  if (trimmedDetails.length > MAX_FLAG_DETAILS_LENGTH) {
    throw new ReportFlagError(
      `A observação deve ter no máximo ${MAX_FLAG_DETAILS_LENGTH} caracteres.`
    );
  }

  if (params.reason === 'other' && trimmedDetails.length === 0) {
    throw new ReportFlagError('Descreva o motivo da denúncia em “Outro”.');
  }

  const { data, error } = await supabase.rpc('submit_beach_report_reply_flag', {
    p_reply_id: params.replyId,
    p_reason: params.reason,
    p_details: trimmedDetails.length > 0 ? trimmedDetails : null,
  });

  if (error) {
    const code = error.code;

    if (code === '23505') {
      throw new ReportFlagError('Você já denunciou esta resposta anteriormente.', {
        code,
        alreadyFlagged: true,
      });
    }

    if (code === 'P0001') {
      throw new ReportFlagError(
        'Você atingiu o limite inicial de 5 denúncias por hora. Tente novamente mais tarde.',
        { code }
      );
    }

    if (code === 'P0002') {
      throw new ReportFlagError(
        'Esta resposta não está mais disponível para denúncia.',
        { code }
      );
    }

    if (code === '42501') {
      throw new ReportFlagError(
        error.message || 'Não é possível denunciar esta resposta.',
        { code }
      );
    }

    if (code === '22023') {
      throw new ReportFlagError(
        error.message || 'Verifique o motivo e a observação informados.',
        { code }
      );
    }

    throw new ReportFlagError(
      'Não foi possível registrar sua denúncia agora. Verifique sua conexão e tente novamente.',
      { code }
    );
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new ReportFlagError(
      'Não foi possível confirmar o registro da denúncia no servidor.'
    );
  }
}

interface RawModerationRepliesQueuePayload {
  filter?: string;
  page?: number;
  pageSize?: number;
  totalCount?: number;
  pendingRepliesCount?: number;
  resolvedRepliesCount?: number;
  hasMore?: boolean;
  items?: RawModerationReplyItem[];
}

interface RawModerationReplyItem {
  replyId: string;
  reportId: string;
  beachId: string;
  beachSlug: string;
  beachName: string;
  reportModerationStatus?: 'visible' | 'hidden';
  reportComment?: string | null;
  reportAuthorName?: string | null;
  authorId: string;
  authorName: string;
  authorUsername?: string | null;
  authorAvatarUrl?: string | null;
  authorAvatarPath?: string | null;
  body: string;
  replyCreatedAt: string;
  moderationStatus: 'visible' | 'hidden';
  moderatedAt?: string | null;
  pendingFlagsCount?: number;
  totalFlagsCount?: number;
  latestFlagAt?: string | null;
  reasonSummary?: ModerationReasonCount[];
  flags?: Array<{
    id: string;
    reason: ReportFlagReason;
    details?: string | null;
    status: ReportFlagStatus;
    createdAt: string;
    reporterName: string;
  }>;
  logs?: Array<{
    id: string;
    action: ModerationAction;
    reason?: string | null;
    flagsResolvedCount?: number;
    createdAt: string;
    moderatorName: string;
  }>;
}

function mapModerationReplyItem(raw: RawModerationReplyItem): ModerationReplyItem {
  const flags: ModerationFlagItem[] = Array.isArray(raw.flags)
    ? raw.flags.map((f) => ({
        id: f.id,
        reason: f.reason,
        details: f.details?.trim() || undefined,
        status: f.status,
        createdAt: f.createdAt,
        reporterName: f.reporterName?.trim() || 'Banhista',
      }))
    : [];

  const logs: ModerationLogItem[] = Array.isArray(raw.logs)
    ? raw.logs.map((l) => ({
        id: l.id,
        action: l.action,
        reason: l.reason?.trim() || undefined,
        flagsResolvedCount: Number(l.flagsResolvedCount ?? 0),
        createdAt: l.createdAt,
        moderatorName: l.moderatorName?.trim() || 'Moderador',
      }))
    : [];

  return {
    replyId: raw.replyId,
    reportId: raw.reportId,
    beachId: raw.beachId,
    beachSlug: raw.beachSlug,
    beachName: raw.beachName,
    reportModerationStatus:
      raw.reportModerationStatus === 'hidden' ? 'hidden' : 'visible',
    reportComment: raw.reportComment ?? '',
    reportAuthorName: raw.reportAuthorName?.trim() || 'Banhista',
    authorId: raw.authorId,
    authorName: raw.authorName?.trim() || 'Banhista',
    authorUsername: raw.authorUsername?.trim() || undefined,
    authorAvatarUrl: resolveProfileAvatarUrl(
      raw.authorAvatarPath,
      raw.authorAvatarUrl
    ),
    body: raw.body ?? '',
    replyCreatedAt: raw.replyCreatedAt,
    moderationStatus: raw.moderationStatus === 'hidden' ? 'hidden' : 'visible',
    moderatedAt: raw.moderatedAt ?? undefined,
    pendingFlagsCount: Number(raw.pendingFlagsCount ?? 0),
    totalFlagsCount: Number(raw.totalFlagsCount ?? flags.length),
    latestFlagAt: raw.latestFlagAt ?? undefined,
    reasonSummary: Array.isArray(raw.reasonSummary) ? raw.reasonSummary : [],
    flags,
    logs,
  };
}

export async function getModerationRepliesQueue(params: {
  filter: ModerationQueueFilter;
  page?: number;
  pageSize?: number;
}): Promise<ModerationRepliesQueueResult> {
  if (!supabase) {
    throw new Error('Conexão com o Supabase não configurada.');
  }

  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(
    25,
    Math.max(1, params.pageSize ?? DEFAULT_MODERATION_PAGE_SIZE)
  );

  const { data, error } = await supabase.rpc('get_moderation_replies', {
    p_filter: params.filter,
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) {
    if (error.code === '42501') {
      throw new ModerationUnauthorizedError(
        'Sua conta não tem permissão de moderação.'
      );
    }
    throw new Error('Não foi possível carregar a fila de respostas agora.');
  }

  const payload = (data ?? {}) as RawModerationRepliesQueuePayload;
  const rawItems = Array.isArray(payload.items) ? payload.items : [];

  return {
    filter: payload.filter === 'resolved' ? 'resolved' : 'pending',
    page: Number(payload.page ?? page),
    pageSize: Number(payload.pageSize ?? pageSize),
    totalCount: Number(payload.totalCount ?? 0),
    pendingRepliesCount: Number(payload.pendingRepliesCount ?? 0),
    resolvedRepliesCount: Number(payload.resolvedRepliesCount ?? 0),
    hasMore: Boolean(payload.hasMore),
    items: rawItems.map(mapModerationReplyItem),
  };
}

export async function moderateReply(params: {
  replyId: string;
  action: ModerationAction;
  reason?: string;
  expectedModerationStatus: 'visible' | 'hidden';
  expectedPendingCount: number;
}): Promise<{
  replyId: string;
  action: ModerationAction;
  moderationStatus: 'visible' | 'hidden';
  moderatedAt: string;
  flagsResolvedCount: number;
}> {
  if (!supabase) {
    throw new Error('Conexão com o Supabase não configurada.');
  }

  const trimmedReason = params.reason?.trim() ?? '';
  if (trimmedReason.length > MAX_MODERATION_REASON_LENGTH) {
    throw new Error(
      `A justificativa deve ter no máximo ${MAX_MODERATION_REASON_LENGTH} caracteres.`
    );
  }

  if (
    (params.action === 'hide' || params.action === 'restore') &&
    trimmedReason.length === 0
  ) {
    throw new Error(
      'Informe uma justificativa para ocultar ou restaurar a resposta.'
    );
  }

  const { data, error } = await supabase.rpc('moderate_beach_report_reply', {
    p_reply_id: params.replyId,
    p_action: params.action,
    p_reason: trimmedReason.length > 0 ? trimmedReason : null,
    p_expected_moderation_status: params.expectedModerationStatus,
    p_expected_pending_count: params.expectedPendingCount,
  });

  if (error) {
    if (error.code === '42501') {
      throw new ModerationUnauthorizedError(
        'Sua conta não tem permissão para executar ações de moderação.'
      );
    }

    if (error.code === '40001') {
      throw new ModerationConflictError(
        error.message ||
          'Esta resposta já recebeu outra decisão ou novas denúncias. Atualize a fila.'
      );
    }

    if (error.code === 'P0002') {
      throw new ModerationConflictError(
        'Esta resposta não foi encontrada ou foi excluída pelo próprio autor.'
      );
    }

    if (error.code === '22023') {
      throw new Error(error.message || 'Dados inválidos para a decisão.');
    }

    throw new Error('Não foi possível registrar a decisão de moderação agora.');
  }

  const result = (data ?? {}) as {
    replyId: string;
    action: ModerationAction;
    moderationStatus: 'visible' | 'hidden';
    moderatedAt: string;
    flagsResolvedCount: number;
  };

  return {
    replyId: result.replyId,
    action: result.action,
    moderationStatus: result.moderationStatus,
    moderatedAt: result.moderatedAt,
    flagsResolvedCount: Number(result.flagsResolvedCount ?? 0),
  };
}
