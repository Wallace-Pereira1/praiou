export function getPublicProfileUrl(username: string): string {
  const cleanUsername = username.replace(/^@+/, '').toLowerCase();
  if (typeof window === 'undefined') {
    return `/u/${encodeURIComponent(cleanUsername)}`;
  }
  return `${window.location.origin}/u/${encodeURIComponent(cleanUsername)}`;
}

export interface ShareProfileOutcome {
  status: 'shared' | 'copied' | 'cancelled' | 'error';
  url: string;
  errorMessage?: string;
}

export async function sharePublicProfile({
  displayName,
  username,
}: {
  displayName: string;
  username: string;
}): Promise<ShareProfileOutcome> {
  const url = getPublicProfileUrl(username);
  const title = `${displayName} (@${username}) no Praiou?`;
  const text = `Veja os relatos de ${displayName} (@${username}) nas praias do Rio no Praiou?.`;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return { status: 'shared', url };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { status: 'cancelled', url };
      }
      // Se navigator.share falhar por restrição do navegador/iframe, tenta copiar o link.
    }
  }

  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(url);
      return { status: 'copied', url };
    } catch {
      return {
        status: 'error',
        url,
        errorMessage: 'Não foi possível copiar o link do perfil automaticamente.',
      };
    }
  }

  return {
    status: 'error',
    url,
    errorMessage: 'Compartilhamento e cópia automática não estão disponíveis neste navegador.',
  };
}
