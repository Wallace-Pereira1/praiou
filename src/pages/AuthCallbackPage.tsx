import { AlertTriangle, ArrowLeft, Loader2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { useApp } from '../context/AppContext';
import { consumePendingAuthReturnPath } from '../utils/authRedirect';

type CallbackStatus = 'loading' | 'cancelled' | 'error';

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { exchangeOAuthCode } = useApp();

  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [message, setMessage] = useState<string>(
    'Validando seu acesso com o Google...'
  );

  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  const code = searchParams.get('code');

  useEffect(() => {
    let active = true;

    async function processCallback() {
      if (errorParam) {
        if (!active) return;
        if (errorParam === 'access_denied') {
          setStatus('cancelled');
          setMessage(
            'Você cancelou a autorização com o Google. Nenhuma alteração foi feita.'
          );
          return;
        }

        setStatus('error');
        setMessage(
          errorDescription?.trim() ||
            'O provedor de autenticação retornou um erro ao concluir o login.'
        );
        return;
      }

      if (!code) {
        if (!active) return;
        setStatus('error');
        setMessage(
          'Código de autorização não encontrado na URL de retorno. Inicie o login novamente.'
        );
        return;
      }

      try {
        await exchangeOAuthCode(code);
        if (!active) return;
        const destination = consumePendingAuthReturnPath('/perfil');
        window.history.replaceState(window.history.state, '', window.location.pathname);
        navigate(destination, { replace: true });
      } catch {
        if (!active) return;
        setStatus('error');
        setMessage(
          'Não foi possível validar sua sessão. O código pode ter expirado ou sido aberto em outra aba.'
        );
      }
    }

    void processCallback();

    return () => {
      active = false;
    };
  }, [code, errorDescription, errorParam, exchangeOAuthCode, navigate]);

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
        <Card padding="lg" className="p-6 sm:p-8 text-center">
          {status === 'loading' && (
            <div className="space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-[#0284C7]">
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              </div>
              <h1 className="font-display text-xl font-bold text-[#0F172A]">
                Entrando no Praiou?
              </h1>
              <p className="text-sm text-[#475569]">{message}</p>
            </div>
          )}

          {status === 'cancelled' && (
            <div className="space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-[#B45309]">
                <XCircle className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="space-y-1.5">
                <h1 className="font-display text-xl font-bold text-[#0F172A]">
                  Login cancelado
                </h1>
                <p className="text-sm text-[#475569]">{message}</p>
              </div>
              <div className="flex flex-col gap-2.5 pt-2">
                <Link
                  to="/entrar"
                  replace
                  className="min-h-[44px] inline-flex w-full items-center justify-center rounded-xl bg-[#0284C7] px-4 text-sm font-semibold text-white hover:bg-sky-700 transition-colors"
                >
                  Tentar novamente
                </Link>
                <Link
                  to="/"
                  replace
                  className="min-h-[44px] inline-flex w-full items-center justify-center rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors"
                >
                  Ir para as praias
                </Link>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FEE2E2] text-[#991B1B]">
                <AlertTriangle className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="space-y-1.5">
                <h1 className="font-display text-xl font-bold text-[#0F172A]">
                  Não foi possível concluir o login
                </h1>
                <p className="text-sm text-[#475569]">{message}</p>
              </div>
              <div className="flex flex-col gap-2.5 pt-2">
                <Link
                  to="/entrar"
                  replace
                  className="min-h-[44px] inline-flex w-full items-center justify-center rounded-xl bg-[#0284C7] px-4 text-sm font-semibold text-white hover:bg-sky-700 transition-colors"
                >
                  Tentar novamente
                </Link>
                <Link
                  to="/"
                  replace
                  className="min-h-[44px] inline-flex w-full items-center justify-center rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors"
                >
                  Ir para as praias
                </Link>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
