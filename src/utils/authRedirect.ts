const AUTH_RETURN_PATH_KEY = 'praiou_auth_return_path';
const ALLOWED_EXACT_RETURN_PATHS = new Set(['/', '/feed', '/perfil', '/relatar']);
const ALLOWED_BEACH_PATH_REGEX = /^\/praia\/[a-z0-9-]+$/;

export function sanitizeInternalReturnPath(
  rawPath: string | null | undefined,
  fallback = '/perfil'
): string {
  if (!rawPath) return fallback;

  const trimmed = rawPath.trim();
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    trimmed.includes('\\') ||
    /[\u0000-\u001F\u007F]/.test(trimmed)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(trimmed, 'https://praiou.local');
    if (parsed.origin !== 'https://praiou.local') {
      return fallback;
    }

    const { pathname, search, hash } = parsed;
    const isAllowed =
      ALLOWED_EXACT_RETURN_PATHS.has(pathname) ||
      ALLOWED_BEACH_PATH_REGEX.test(pathname);

    if (!isAllowed) {
      return fallback;
    }

    return `${pathname}${search}${hash}`;
  } catch {
    return fallback;
  }
}

export function setPendingAuthReturnPath(
  rawPath: string | null | undefined,
  fallback = '/perfil'
): string {
  const safePath = sanitizeInternalReturnPath(rawPath, fallback);
  try {
    sessionStorage.setItem(AUTH_RETURN_PATH_KEY, safePath);
  } catch {
    // Ignora falhas de acesso ao sessionStorage
  }
  return safePath;
}

export function getPendingAuthReturnPath(fallback = '/perfil'): string {
  try {
    const stored = sessionStorage.getItem(AUTH_RETURN_PATH_KEY);
    return sanitizeInternalReturnPath(stored, fallback);
  } catch {
    return fallback;
  }
}

export function consumePendingAuthReturnPath(fallback = '/perfil'): string {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(AUTH_RETURN_PATH_KEY);
    sessionStorage.removeItem(AUTH_RETURN_PATH_KEY);
  } catch {
    // Ignora falhas de acesso ao sessionStorage
  }
  return sanitizeInternalReturnPath(stored, fallback);
}

export function clearPendingAuthReturnPath(): void {
  try {
    sessionStorage.removeItem(AUTH_RETURN_PATH_KEY);
  } catch {
    // Ignora falhas de acesso ao sessionStorage
  }
}
