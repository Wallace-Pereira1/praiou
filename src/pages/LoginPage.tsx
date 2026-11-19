import { ArrowLeft, Check, Copy, LogIn, Mail } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useApp } from '../context/AppContext';

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback para ambientes de iframe com restrição de Clipboard API
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function LoginPage() {
  const { loginDemo } = useApp();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [loadingMethod, setLoadingMethod] = useState<'google' | 'email' | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [appOrigin, setAppOrigin] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.origin : ''
  );
  const [copiedField, setCopiedField] = useState<'origin' | 'callback' | null>(null);

  useEffect(() => {
    setAppOrigin(window.location.origin);
  }, []);

  const suggestedCallbackUrl = appOrigin ? `${appOrigin}/auth/callback` : '';

  const handleCopy = async (field: 'origin' | 'callback', value: string) => {
    const copied = await copyTextToClipboard(value);
    if (copied) {
      setCopiedField(field);
      window.setTimeout(() => {
        setCopiedField((prev) => (prev === field ? null : prev));
      }, 2000);
    }
  };

  const handleGoogleLogin = async () => {
    setEmailError(null);
    setLoadingMethod('google');
    try {
      await loginDemo('google');
      navigate('/');
    } finally {
      setLoadingMethod(null);
    }
  };

  const handleEmailLogin = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setEmailError('Digite um e-mail válido para continuar.');
      return;
    }

    setEmailError(null);
    setLoadingMethod('email');
    try {
      await loginDemo('email', trimmed);
      navigate('/');
    } finally {
      setLoadingMethod(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A] px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <Link
          to="/"
          className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl px-2.5 -ml-2 text-sm font-semibold text-[#475569] hover:text-[#0F172A] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar para as praias
        </Link>
      </div>

      <div className="mx-auto my-auto w-full max-w-md py-6">
        <Card padding="lg" className="p-6 sm:p-8">
          <div className="text-center">
            <span className="font-display text-3xl font-extrabold tracking-tight text-[#0F172A]">
              Praiou?
            </span>
            <p className="mt-2 text-sm text-[#475569]">
              Entre em segundos para publicar relatos e fotos das praias do Rio.
            </p>
          </div>

          <div className="mt-7 space-y-4">
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              loading={loadingMethod === 'google'}
              disabled={loadingMethod !== null}
              onClick={handleGoogleLogin}
            >
              {loadingMethod !== 'google' && (
                <LogIn className="h-4 w-4 text-[#0284C7]" aria-hidden="true" />
              )}
              {loadingMethod === 'google'
                ? 'Entrando com Google...'
                : 'Continuar com Google'}
            </Button>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-[#E2E8F0]" />
              <span className="mx-3 shrink-0 text-xs font-medium text-[#475569]">
                ou por e-mail
              </span>
              <div className="flex-grow border-t border-[#E2E8F0]" />
            </div>

            <form onSubmit={handleEmailLogin} noValidate className="space-y-3">
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-semibold text-[#475569]"
                >
                  Seu e-mail
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError(null);
                  }}
                  placeholder="voce@exemplo.com"
                  className="mt-1.5 min-h-[48px] w-full rounded-xl border border-[#E2E8F0] bg-white px-3.5 text-sm text-[#0F172A] placeholder:text-[#475569]/60 focus:border-[#0284C7] focus:outline-none"
                />
                {emailError && (
                  <p className="mt-1.5 text-xs font-medium text-[#991B1B]">{emailError}</p>
                )}
              </div>

              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={loadingMethod === 'email'}
                disabled={loadingMethod !== null}
              >
                {loadingMethod !== 'email' && <Mail className="h-4 w-4" aria-hidden="true" />}
                {loadingMethod === 'email'
                  ? 'Enviando link...'
                  : 'Receber link de acesso'}
              </Button>
            </form>
          </div>
        </Card>

        <div className="mt-4 rounded-2xl border border-dashed border-[#CBD5E1] bg-white/80 p-4 text-xs text-[#475569]">
          <p className="font-semibold text-[#0F172A]">
            Diagnóstico temporário (Supabase Auth Redirect)
          </p>

          <div className="mt-3 space-y-2.5">
            <div>
              <span className="block text-[11px] font-medium text-[#64748B]">
                Origem real (window.location.origin)
              </span>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-lg bg-[#F1F5F9] px-2.5 py-2 font-mono text-[11px] text-[#0F172A]">
                  {appOrigin || 'Indisponível'}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy('origin', appOrigin)}
                  disabled={!appOrigin}
                  className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs font-semibold text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-50"
                >
                  {copiedField === 'origin' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[#15803D]" aria-hidden="true" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-[#475569]" aria-hidden="true" />
                      Copiar
                    </>
                  )}
                </button>
              </div>
            </div>

            <div>
              <span className="block text-[11px] font-medium text-[#64748B]">
                URL de callback sugerida
              </span>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-lg bg-[#F1F5F9] px-2.5 py-2 font-mono text-[11px] text-[#0F172A]">
                  {suggestedCallbackUrl || 'Indisponível'}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy('callback', suggestedCallbackUrl)}
                  disabled={!suggestedCallbackUrl}
                  className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs font-semibold text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-50"
                >
                  {copiedField === 'callback' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[#15803D]" aria-hidden="true" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-[#475569]" aria-hidden="true" />
                      Copiar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
