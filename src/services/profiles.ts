import { supabase } from '../lib/supabase';
import type { UserProfile } from '../types';

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
  'id, display_name, avatar_url, avatar_path, banner_path, created_at, updated_at';

interface SupabaseProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  avatar_path: string | null;
  banner_path: string | null;
  created_at: string;
  updated_at: string;
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
    avatarUrl: resolveProfileAvatarUrl(avatarPath, externalAvatarUrl),
    externalAvatarUrl,
    avatarPath,
    bannerPath,
    bannerUrl: getBannerPublicUrl(bannerPath),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
