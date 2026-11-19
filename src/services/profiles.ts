import { supabase } from '../lib/supabase';
import type { UserProfile } from '../types';

interface SupabaseProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  banner_path: string | null;
  created_at: string;
  updated_at: string;
}

function mapSupabaseProfile(row: SupabaseProfileRow): UserProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ?? undefined,
    bannerPath: row.banner_path ?? undefined,
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
    .select('id, display_name, avatar_url, banner_path, created_at, updated_at')
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
    .select('id, display_name, avatar_url, banner_path, created_at, updated_at')
    .single();

  if (error || !data) {
    throw new Error('Não foi possível salvar o nome do perfil agora. Tente novamente.');
  }

  return mapSupabaseProfile(data as SupabaseProfileRow);
}
