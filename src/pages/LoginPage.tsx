import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { AuthMethodsPanel } from '../components/auth/AuthMethodsPanel';
import { Card } from '../components/ui/Card';
import { useApp } from '../context/AppContext';
import {
  getPendingAuthReturnPath,
  sanitizeInternalReturnPath,
} from '../utils/authRedirect';

export function LoginPage() {
  const { user, authReady } = useApp();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const rawStateReturn = (location.state as { returnTo?: string } | null)?.returnTo;
  const rawQueryReturn = searchParams.get('retorno');
  const explicitReturn = rawQueryReturn ?? rawStateReturn;

  const returnTo = explicitReturn
    ? sanitizeInternalReturnPath(explicitReturn, '/perfil')
    : getPendingAuthReturnPath('/perfil');

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
    return <Navigate to={returnTo} replace />;
  }

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

          <div className="mt-7">
            <AuthMethodsPanel returnTo={returnTo} fullWidth />
          </div>
        </Card>
      </div>
    </div>
  );
}
