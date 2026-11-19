import { AlertTriangle, LogIn } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { setPendingAuthReturnPath } from '../../utils/authRedirect';
import { Button } from '../ui/Button';

type AuthProviderId = 'google';

interface AuthProviderOption {
  id: AuthProviderId;
  label: string;
  loadingLabel: string;
}

const ACTIVE_AUTH_PROVIDERS: AuthProviderOption[] = [
  {
    id: 'google',
    label: 'Continuar com Google',
    loadingLabel: 'Redirecionando para o Google...',
  },
];

interface AuthMethodsPanelProps {
  returnTo?: string;
  fullWidth?: boolean;
}

export function AuthMethodsPanel({
  returnTo = '/perfil',
  fullWidth = false,
}: AuthMethodsPanelProps) {
  const { signInWithGoogle } = useApp();

  const [activeProvider, setActiveProvider] = useState<AuthProviderId | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleProviderSignIn = async (providerId: AuthProviderId) => {
    if (activeProvider !== null) return;

    setErrorMessage(null);
    setActiveProvider(providerId);
    setPendingAuthReturnPath(returnTo, '/perfil');

    try {
      if (providerId === 'google') {
        await signInWithGoogle();
      }
    } catch {
      setErrorMessage(
        'Não foi possível iniciar o login com o Google agora. Tente novamente.'
      );
      setActiveProvider(null);
    }
  };

  const isStarting = activeProvider !== null;

  return (
    <div className={fullWidth ? 'w-full space-y-3' : 'w-full max-w-xs mx-auto space-y-3'}>
      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-[#EF4444]/30 bg-[#FEE2E2] px-3.5 py-3 text-left text-sm text-[#991B1B]"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="space-y-2.5">
        {ACTIVE_AUTH_PROVIDERS.map((provider) => {
          const isProviderLoading = activeProvider === provider.id;

          return (
            <Button
              key={provider.id}
              variant="secondary"
              size="lg"
              fullWidth
              loading={isProviderLoading}
              disabled={isStarting}
              onClick={() => void handleProviderSignIn(provider.id)}
            >
              {!isProviderLoading && (
                <LogIn className="h-4 w-4 text-[#0284C7]" aria-hidden="true" />
              )}
              {isProviderLoading ? provider.loadingLabel : provider.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
