import { AlertTriangle, ArrowLeft, Loader2, LogIn } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useApp } from '../context/AppContext';

export function LoginPage() {
  const { user, authReady, signInWithGoogle } = useApp();

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!authReady) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A] px-4 py-6">
        <div className="mx-auto my-auto w-full max-w-md py-6">
          <Card padding="lg" className="p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-[#0284C7]">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            </div>
            <p className="mt-3 text-sm font-medium text-[#475569]">
              Verificando sua sessão...
            </p>
          </Card>
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/perfil" replace />;
  }

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setIsLoading(true);
    try {
      await signInWithGoogle();
    } catch {
      setErrorMessage(
        'Não foi possível iniciar o login com o Google agora. Tente novamente.'
      );
      setIsLoading(false);
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
              Entre com sua conta Google para acessar seu perfil e publicar relatos das praias do Rio.
            </p>
          </div>

          <div className="mt-7 space-y-4">
            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-[#EF4444]/30 bg-[#FEE2E2] px-3.5 py-3 text-sm text-[#991B1B]"
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            )}

            <Button
              variant="secondary"
              size="lg"
              fullWidth
              loading={isLoading}
              disabled={isLoading}
              onClick={handleGoogleLogin}
            >
              {!isLoading && (
                <LogIn className="h-4 w-4 text-[#0284C7]" aria-hidden="true" />
              )}
              {isLoading ? 'Redirecionando para o Google...' : 'Continuar com Google'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
