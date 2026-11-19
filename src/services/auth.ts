import type { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { AppUser } from '../types';
import { clearPendingAuthReturnPath } from '../utils/authRedirect';

const LEGACY_DEMO_USER_KEY = 'praiou_demo_user';

const exchangeInFlightByCode = new Map<string, Promise<AppUser>>();
const exchangedUserByCode = new Map<string, AppUser>();

function clearLegacyDemoSession(): void {
  try {
    localStorage.removeItem(LEGACY_DEMO_USER_KEY);
  } catch {
    // Ignora falhas de acesso ao storage
  }
}

export function mapSupabaseUserToAppUser(
  sbUser: SupabaseUser | null | undefined
): AppUser | null {
  if (!sbUser) return null;

  const metadata = (sbUser.user_metadata ?? {}) as Record<string, unknown>;
  const rawName =
    (typeof metadata.full_name === 'string' && metadata.full_name.trim()) ||
    (typeof metadata.name === 'string' && metadata.name.trim()) ||
    (typeof metadata.preferred_username === 'string' && metadata.preferred_username.trim()) ||
    'Banhista';

  const rawAvatar =
    (typeof metadata.avatar_url === 'string' && metadata.avatar_url.trim()) ||
    (typeof metadata.picture === 'string' && metadata.picture.trim()) ||
    undefined;

  return {
    id: sbUser.id,
    name: rawName,
    provider: 'google',
    avatarUrl: rawAvatar,
  };
}

export async function getCurrentUser(): Promise<AppUser | null> {
  clearLegacyDemoSession();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    return null;
  }

  return mapSupabaseUserToAppUser(data.session?.user ?? null);
}

export function onAuthStateChange(
  callback: (user: AppUser | null) => void
): () => void {
  if (!supabase) {
    return () => {};
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    clearLegacyDemoSession();
    if (event === 'SIGNED_OUT') {
      exchangedUserByCode.clear();
    }
    callback(mapSupabaseUserToAppUser(session?.user ?? null));
  });

  return () => {
    subscription.unsubscribe();
  };
}

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) {
    throw new Error('Autenticação não configurada neste ambiente.');
  }

  clearLegacyDemoSession();

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    throw error;
  }
}

export async function exchangeCodeForSession(code: string): Promise<AppUser> {
  if (!supabase) {
    throw new Error('Autenticação não configurada neste ambiente.');
  }

  const trimmedCode = code.trim();
  if (!trimmedCode) {
    throw new Error('Código de autenticação ausente.');
  }

  const cachedUser = exchangedUserByCode.get(trimmedCode);
  if (cachedUser) {
    return cachedUser;
  }

  const existingPromise = exchangeInFlightByCode.get(trimmedCode);
  if (existingPromise) {
    return existingPromise;
  }

  const exchangePromise = (async () => {
    clearLegacyDemoSession();

    const { data, error } = await supabase.auth.exchangeCodeForSession(trimmedCode);
    if (error) {
      throw error;
    }

    const mapped = mapSupabaseUserToAppUser(data.session?.user ?? null);
    if (!data.session || !mapped) {
      throw new Error('Sessão não retornada após validação do código.');
    }

    exchangedUserByCode.set(trimmedCode, mapped);
    return mapped;
  })().finally(() => {
    exchangeInFlightByCode.delete(trimmedCode);
  });

  exchangeInFlightByCode.set(trimmedCode, exchangePromise);
  return exchangePromise;
}

export async function signOut(): Promise<void> {
  clearLegacyDemoSession();
  clearPendingAuthReturnPath();
  exchangedUserByCode.clear();
  if (!supabase) return;

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}
