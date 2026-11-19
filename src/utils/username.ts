export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;
export const USERNAME_REGEX = /^[a-z0-9_]{3,24}$/;

// Deve permanecer sincronizado com chk_profiles_username_not_reserved em 010_usernames_and_public_profiles.sql.
export const RESERVED_USERNAMES = new Set<string>([
  'admin',
  'administrador',
  'administracao',
  'moderador',
  'moderacao',
  'suporte',
  'support',
  'praiou',
  'sistema',
  'system',
  'oficial',
  'staff',
  'equipe',
  'contato',
  'ajuda',
  'help',
  'seguranca',
  'privacidade',
  'termos',
  'sobre',
  'root',
  'api',
  'feed',
  'perfil',
  'entrar',
  'relatar',
  'praia',
  'praias',
  'auth',
]);

export function normalizeUsernameInput(raw: string): string {
  return raw.replace(/^@+/, '').toLowerCase();
}

export function isValidPublicUsernameParam(raw: string | undefined): boolean {
  if (!raw) return false;
  const normalized = normalizeUsernameInput(raw);
  return USERNAME_REGEX.test(normalized) && !RESERVED_USERNAMES.has(normalized);
}

export function validateUsername(raw: string): {
  normalized: string;
  error: string | null;
} {
  const normalized = normalizeUsernameInput(raw);

  if (normalized.length === 0) {
    return {
      normalized,
      error: 'Escolha um @username entre 3 e 24 caracteres.',
    };
  }

  if (/\s/.test(normalized)) {
    return {
      normalized,
      error: 'O @username não pode conter espaços.',
    };
  }

  if (normalized.length < USERNAME_MIN_LENGTH) {
    return {
      normalized,
      error: `O @username deve ter pelo menos ${USERNAME_MIN_LENGTH} caracteres.`,
    };
  }

  if (normalized.length > USERNAME_MAX_LENGTH) {
    return {
      normalized,
      error: `O @username deve ter no máximo ${USERNAME_MAX_LENGTH} caracteres.`,
    };
  }

  if (!/^[a-z0-9_]+$/.test(normalized)) {
    return {
      normalized,
      error: 'Use apenas letras sem acento (a-z), números (0-9) e underline (_).',
    };
  }

  if (RESERVED_USERNAMES.has(normalized)) {
    return {
      normalized,
      error: 'Este @username é reservado e não pode ser usado.',
    };
  }

  return {
    normalized,
    error: null,
  };
}
