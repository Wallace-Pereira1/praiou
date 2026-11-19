import { List, Plus, Star, User } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { getInitials } from '../../utils/formatters';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user } = useApp();
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setAvatarError(false);
  }, [user?.avatarUrl]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* Header desktop (3 zonas: Marca | Links de navegação | 1 CTA primário) */}
      <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-13 md:h-16 max-w-6xl items-center justify-between gap-8 px-4 sm:px-6">
          <Link
            to="/"
            className="font-display text-xl font-extrabold tracking-tight text-[#0F172A] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#0284C7] rounded-md"
          >
            Praiou?
          </Link>

          <nav
            aria-label="Navegação principal"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#475569]"
          >
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `py-1.5 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                  isActive
                    ? 'border-[#0284C7] text-[#0F172A] font-semibold'
                    : 'border-transparent hover:text-[#0F172A]'
                }`
              }
            >
              Praias
            </NavLink>
            <NavLink
              to="/feed"
              className={({ isActive }) =>
                `py-1.5 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                  isActive
                    ? 'border-[#0284C7] text-[#0F172A] font-semibold'
                    : 'border-transparent hover:text-[#0F172A]'
                }`
              }
            >
              Feed
            </NavLink>
            <NavLink
              to="/perfil"
              className={({ isActive }) =>
                `py-1.5 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                  isActive
                    ? 'border-[#0284C7] text-[#0F172A] font-semibold'
                    : 'border-transparent hover:text-[#0F172A]'
                }`
              }
            >
              Perfil
            </NavLink>
          </nav>

          <div className="flex items-center shrink-0">
            <Link
              to="/relatar"
              className="hidden md:inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#0284C7] px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Relatar
            </Link>

            <Link
              to={user ? '/perfil' : '/entrar'}
              className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-end text-sm font-semibold text-[#0284C7] whitespace-nowrap shrink-0"
            >
              {user ? (
                user.avatarUrl && !avatarError ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarError(true)}
                    className="h-8 w-8 rounded-full border border-[#E2E8F0] object-cover"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-[#0284C7]">
                    {getInitials(user.name)}
                  </span>
                )
              ) : (
                'Entrar'
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* Conteúdo principal com respiro inferior para a bottom nav e safe area no mobile */}
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pt-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-6 md:pt-7 md:pb-12">
        {children}
      </main>

      {/* Bottom Navigation fixa no mobile */}
      <nav
        aria-label="Navegação inferior"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[#E2E8F0] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-4 items-center px-2">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
                isActive ? 'text-[#0284C7]' : 'text-[#475569] hover:text-[#0F172A]'
              }`
            }
          >
            <List className="h-5 w-5" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-tight">Praias</span>
          </NavLink>

          <NavLink
            to="/feed"
            className={({ isActive }) =>
              `min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
                isActive ? 'text-[#0284C7]' : 'text-[#475569] hover:text-[#0F172A]'
              }`
            }
          >
            <Star className="h-5 w-5" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-tight">Feed</span>
          </NavLink>

          <Link
            to="/relatar"
            aria-label="Novo relato"
            className="flex flex-col items-center justify-center"
          >
            <span className="flex h-11 w-14 items-center justify-center rounded-2xl bg-[#0284C7] text-white shadow-sm active:scale-95 transition-transform">
              <Plus className="h-5 w-5 stroke-[2.5]" aria-hidden="true" />
            </span>
          </Link>

          <NavLink
            to="/perfil"
            className={({ isActive }) =>
              `min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
                isActive ? 'text-[#0284C7]' : 'text-[#475569] hover:text-[#0F172A]'
              }`
            }
          >
            <User className="h-5 w-5" aria-hidden="true" />
            <span className="text-[11px] font-semibold tracking-tight">Eu</span>
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
