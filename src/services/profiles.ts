import { supabase } from '../lib/supabase';
import type { PublicProfile, PublicProfileStats, UserProfile } from '../types';
import {
  RESERVED_USERNAMES,
  USERNAME_REGEX,
  normalizeUsernameInput,
  validateUsername,
} from '../utils/username';

export const AVATARS_BUCKET = 'avatars';
export const BANNERS_BUCKET = 'profile-banners';
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_BANNER_BYTES = 3 * 1024 * 1024; // 3 MB
export const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
export const ALLOWED_BANNER_MIME_TYPES = ALLOWED_AVATAR_MIME_TYPES;

const PROFILE_SELECT =
  'id, display_name, username, avatar_url, avatar_path, banner_path, created_at, updated_at';

const PUBLIC_PROFILE_SELECT =
  'id, display_name, username, avatar_url, avatar_path, banner_path';

interface SupabaseProfileRow {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  avatar_path: string | null;
  banner_path: string | null;
  created_at: string;
  updated_at: string;
}

interface SupabasePublicProfileRow {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  avatar_path: string | null;
  banner_path: string | null;
}

interface PublicProfileStatsRpcRow {
  visible_reports_count: number | string | null;
  evaluated_beaches_count: number | string | null;
}

export function getAvatarPublicUrl(avatarPath?: string | null): string | undefined {
  const trimmedPath = avatarPath?.trim();
  if (!trimmedPath || !supabase) {
    return undefined;
  }

  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(trimmedPath);
  return data.publicUrl || undefined;
}

export function getBannerPublicUrl(bannerPath?: string | null): string | undefined {
  const trimmedPath = bannerPath?.trim();
  if (!trimmedPath || !supabase) {
    return undefined;
  }

  const { data } = supabase.storage.from(BANNERS_BUCKET).getPublicUrl(trimmedPath);
  return data.publicUrl || undefined;
}

export function resolveProfileAvatarUrl(
  avatarPath?: string | null,
  externalAvatarUrl?: string | null
): string | undefined {
  const customUrl = getAvatarPublicUrl(avatarPath);
  if (customUrl) {
    return customUrl;
  }
  const external = externalAvatarUrl?.trim();
  return external || undefined;
}

export function validateAvatarFile(file: Blob): string | null {
  if (!ALLOWED_AVATAR_MIME_TYPES.has(file.type)) {
    return 'Escolha uma imagem nos formatos JPEG, PNG ou WebP.';
  }
  if (file.size <= 0) {
    return 'A imagem selecionada está vazia.';
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return 'A foto deve ter no máximo 2 MB.';
  }
  return null;
}

export function validateBannerFile(file: Blob): string | null {
  if (!ALLOWED_BANNER_MIME_TYPES.has(file.type)) {
    return 'Escolha uma imagem nos formatos JPEG, PNG ou WebP.';
  }
  if (file.size <= 0) {
    return 'A imagem selecionada está vazia.';
  }
  if (file.size > MAX_BANNER_BYTES) {
    return 'A capa deve ter no máximo 3 MB.';
  }
  return null;
}

function getExtensionForMime(mimeType: string): 'jpg' | 'png' | 'webp' {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function generateStorageToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function mapSupabaseProfile(row: SupabaseProfileRow): UserProfile {
  const avatarPath = row.avatar_path?.trim() || undefined;
  const externalAvatarUrl = row.avatar_url?.trim() || undefined;
  const bannerPath = row.banner_path?.trim() || undefined;

  return {
    id: row.id,
    displayName: row.display_name,
    username: row.username,
    avatarUrl: resolveProfileAvatarUrl(avatarPath, externalAvatarUrl),
    externalAvatarUrl,
    avatarPath,
    bannerPath,
    bannerUrl: getBannerPublicUrl(bannerPath),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPublicProfile(row: SupabasePublicProfileRow): PublicProfile {
  return {
    id: row.id,
    displayName: row.display_name?.trim() || 'Banhista',
    username: row.username,
    avatarUrl: resolveProfileAvatarUrl(row.avatar_path, row.avatar_url),
    bannerUrl: getBannerPublicUrl(row.banner_path),
  };
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  if (!supabase) {
    throw new Error('Supabase não configurado neste ambiente.');
  }

  const trimmedId = userId.trim();
  if (!trimmedId) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', trimmedId)
    .maybeSingle();

  if (error) {
    throw new Error('Não foi possível carregar seu perfil público no momento.');
  }

  if (!data) {
    return null;
  }

  return mapSupabaseProfile(data as SupabaseProfileRow);
}

export async function getPublicProfileByUsername(
  rawUsername: string
): Promise<PublicProfile | null> {
  if (!supabase) {
    throw new Error('Supabase não configurado neste ambiente.');
  }

  const normalized = normalizeUsernameInput(rawUsername);
  if (!USERNAME_REGEX.test(normalized)) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(PUBLIC_PROFILE_SELECT)
    .eq('username', normalized)
    .maybeSingle();

  if (error) {
    throw new Error('Não foi possível carregar este perfil agora.');
  }

  if (!data) {
    return null;
  }

  return mapPublicProfile(data as SupabasePublicProfileRow);
}

export async function getPublicProfileStats(
  userId: string
): Promise<PublicProfileStats> {
  if (!supabase) {
    throw new Error('Supabase não configurado neste ambiente.');
  }

  const trimmedId = userId.trim();
  if (!trimmedId) {
    return { visibleReportsCount: 0, evaluatedBeachesCount: 0 };
  }

  const { data, error } = await supabase.rpc('get_public_profile_stats', {
    p_user_id: trimmedId,
  });

  if (error) {
    throw new Error('Não foi possível carregar as estatísticas públicas do perfil.');
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | PublicProfileStatsRpcRow
    | undefined;

  const visibleReportsCount = Number(row?.visible_reports_count ?? 0);
  const evaluatedBeachesCount = Number(row?.evaluated_beaches_count ?? 0);

  return {
    visibleReportsCount: Number.isFinite(visibleReportsCount)
      ? Math.max(0, Math.round(visibleReportsCount))
      : 0,
    evaluatedBeachesCount: Number.isFinite(evaluatedBeachesCount)
      ? Math.max(0, Math.round(evaluatedBeachesCount))
      : 0,
  };
}

export async function checkUsernameAvailability(
  rawUsername: string,
  excludeUserId?: string
): Promise<{ available: boolean; normalized: string }> {
  if (!supabase) {
    throw new Error('Supabase não configurado neste ambiente.');
  }

  const { normalized, error: validationError } = validateUsername(rawUsername);
  if (validationError) {
    throw new Error(validationError);
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', normalized)
    .maybeSingle();

  if (error) {
    throw new Error('Não foi possível verificar a disponibilidade agora.');
  }

  const existingId = (data as { id?: string } | null)?.id;
  return {
    available: !existingId || (Boolean(excludeUserId) && existingId === excludeUserId),
    normalized,
  };
}

export async function updateOwnProfile({
  displayName,
}: {
  displayName: string;
}): Promise<UserProfile> {
  if (!supabase) {
    throw new Error('Supabase não configurado neste ambiente.');
  }

  const trimmedName = displayName.trim();
  if (trimmedName.length < 2 || trimmedName.length > 60) {
    throw new Error('O nome deve ter entre 2 e 60 caracteres.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) {
    throw new Error('Sessão expirada. Entre novamente com o Google para salvar.');
  }

  const userId = sessionData.session.user.id;

  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: trimmedName })
    .eq('id', userId)
    .select(PROFILE_SELECT)
    .single();

  if (error || !data) {
    throw new Error('Não foi possível salvar o nome do perfil agora. Tente novamente.');
  }

  return mapSupabaseProfile(data as SupabaseProfileRow);
}

export async function updateOwnUsername(rawUsername: string): Promise<UserProfile> {
  if (!supabase) {
    throw new Error('Supabase não configurado neste ambiente.');
  }

  const { normalized, error: validationError } = validateUsername(rawUsername);
  if (validationError) {
    throw new Error(validationError);
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) {
    throw new Error('Sessão expirada. Entre novamente com o Google para salvar.');
  }

  const userId = sessionData.session.user.id;

  const { data, error } = await supabase
    .from('profiles')
    .update({ username: normalized })
    .eq('id', userId)
    .select(PROFILE_SELECT)
    .single();

  if (error || !data) {
    if (error?.code === '23505') {
      throw new Error('Este @username já está em uso por outra conta. Escolha outro.');
    }
    if (error?.code === '23514') {
      if (RESERVED_USERNAMES.has(normalized)) {
        throw new Error('Este @username é reservado e não pode ser usado.');
      }
      throw new Error(
        'Use de 3 a 24 caracteres: apenas letras minúsculas sem acento, números e underline (_).'
      );
    }
    if (error?.code === '42501') {
      throw new Error('Você não tem permissão para alterar este @username.');
    }
    throw new Error('Não foi possível salvar seu @username agora. Tente novamente.');
  }

  return mapSupabaseProfile(data as SupabaseProfileRow);
}

async function tryRemoveStorageObject(
  bucket: string,
  path: string | null | undefined
): Promise<void> {
  const trimmed = path?.trim();
  if (!trimmed || !supabase) return;

  try {
    const { error } = await supabase.storage.from(bucket).remove([trimmed]);
    if (error) {
      // Limpeza em melhor esforço: uma queda de conexão ou erro transitório
      // não deve sobrescrever o estado confirmado nem quebrar a recuperação.
      return;
    }
  } catch {
    // Limpeza em melhor esforço quando há falha de rede ou indisponibilidade.
  }
}

export async function uploadOwnAvatar(blob: Blob): Promise<UserProfile> {
  if (!supabase) {
    throw new Error('Supabase não configurado neste ambiente.');
  }

  const validationError = validateAvatarFile(blob);
  if (validationError) {
    throw new Error(validationError);
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) {
    throw new Error('Sessão expirada. Entre novamente com o Google para salvar sua foto.');
  }

  const userId = sessionData.session.user.id;

  const { data: currentRow, error: currentError } = await supabase
    .from('profiles')
    .select('avatar_path')
    .eq('id', userId)
    .maybeSingle();

  if (currentError) {
    throw new Error(
      'Não foi possível verificar seu perfil atual antes de enviar a foto. Tente novamente.'
    );
  }

  const previousAvatarPath =
    (currentRow as { avatar_path: string | null } | null)?.avatar_path?.trim() || null;

  const ext = getExtensionForMime(blob.type);
  const newPath = `${userId}/${generateStorageToken()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(newPath, blob, {
      contentType: blob.type,
      upsert: false,
      cacheControl: '31536000',
    });

  if (uploadError) {
    throw new Error('Não foi possível enviar a nova foto agora. Sua foto anterior foi mantida.');
  }

  const { data: updatedRow, error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_path: newPath })
    .eq('id', userId)
    .select(PROFILE_SELECT)
    .single();

  if (updateError || !updatedRow) {
    await tryRemoveStorageObject(AVATARS_BUCKET, newPath);
    throw new Error(
      'Não foi possível salvar a foto no perfil. Sua foto anterior foi mantida.'
    );
  }

  if (previousAvatarPath && previousAvatarPath !== newPath) {
    await tryRemoveStorageObject(AVATARS_BUCKET, previousAvatarPath);
  }

  return mapSupabaseProfile(updatedRow as SupabaseProfileRow);
}

export async function removeOwnAvatar(): Promise<UserProfile> {
  if (!supabase) {
    throw new Error('Supabase não configurado neste ambiente.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) {
    throw new Error('Sessão expirada. Entre novamente com o Google para remover a foto.');
  }

  const userId = sessionData.session.user.id;

  const { data: currentRow, error: currentError } = await supabase
    .from('profiles')
    .select('avatar_path')
    .eq('id', userId)
    .maybeSingle();

  if (currentError) {
    throw new Error('Não foi possível verificar seu perfil atual. Tente novamente.');
  }

  const previousAvatarPath =
    (currentRow as { avatar_path: string | null } | null)?.avatar_path?.trim() || null;

  const { data: updatedRow, error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_path: null })
    .eq('id', userId)
    .select(PROFILE_SELECT)
    .single();

  if (updateError || !updatedRow) {
    throw new Error('Não foi possível remover sua foto personalizada agora. Tente novamente.');
  }

  if (previousAvatarPath) {
    await tryRemoveStorageObject(AVATARS_BUCKET, previousAvatarPath);
  }

  return mapSupabaseProfile(updatedRow as SupabaseProfileRow);
}

export async function uploadOwnBanner(blob: Blob): Promise<UserProfile> {
  if (!supabase) {
    throw new Error('Supabase não configurado neste ambiente.');
  }

  const validationError = validateBannerFile(blob);
  if (validationError) {
    throw new Error(validationError);
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) {
    throw new Error('Sessão expirada. Entre novamente com o Google para salvar sua capa.');
  }

  const userId = sessionData.session.user.id;

  const { data: currentRow, error: currentError } = await supabase
    .from('profiles')
    .select('banner_path')
    .eq('id', userId)
    .maybeSingle();

  if (currentError) {
    throw new Error(
      'Não foi possível verificar seu perfil atual antes de enviar a capa. Tente novamente.'
    );
  }

  const previousBannerPath =
    (currentRow as { banner_path: string | null } | null)?.banner_path?.trim() || null;

  const ext = getExtensionForMime(blob.type);
  const newPath = `${userId}/${generateStorageToken()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BANNERS_BUCKET)
    .upload(newPath, blob, {
      contentType: blob.type,
      upsert: false,
      cacheControl: '31536000',
    });

  if (uploadError) {
    throw new Error('Não foi possível enviar a nova capa agora. Sua capa anterior foi mantida.');
  }

  const { data: updatedRow, error: updateError } = await supabase
    .from('profiles')
    .update({ banner_path: newPath })
    .eq('id', userId)
    .select(PROFILE_SELECT)
    .single();

  if (updateError || !updatedRow) {
    await tryRemoveStorageObject(BANNERS_BUCKET, newPath);
    throw new Error(
      'Não foi possível salvar a capa no perfil. Sua capa anterior foi mantida.'
    );
  }

  if (previousBannerPath && previousBannerPath !== newPath) {
    await tryRemoveStorageObject(BANNERS_BUCKET, previousBannerPath);
  }

  return mapSupabaseProfile(updatedRow as SupabaseProfileRow);
}

export async function removeOwnBanner(): Promise<UserProfile> {
  if (!supabase) {
    throw new Error('Supabase não configurado neste ambiente.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) {
    throw new Error('Sessão expirada. Entre novamente com o Google para remover a capa.');
  }

  const userId = sessionData.session.user.id;

  const { data: currentRow, error: currentError } = await supabase
    .from('profiles')
    .select('banner_path')
    .eq('id', userId)
    .maybeSingle();

  if (currentError) {
    throw new Error('Não foi possível verificar seu perfil atual. Tente novamente.');
  }

  const previousBannerPath =
    (currentRow as { banner_path: string | null } | null)?.banner_path?.trim() || null;

  const { data: updatedRow, error: updateError } = await supabase
    .from('profiles')
    .update({ banner_path: null })
    .eq('id', userId)
    .select(PROFILE_SELECT)
    .single();

  if (updateError || !updatedRow) {
    throw new Error('Não foi possível remover sua capa personalizada agora. Tente novamente.');
  }

  if (previousBannerPath) {
    await tryRemoveStorageObject(BANNERS_BUCKET, previousBannerPath);
  }

  return mapSupabaseProfile(updatedRow as SupabaseProfileRow);
}
