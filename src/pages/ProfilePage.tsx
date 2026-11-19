import { LogIn, LogOut, Plus, User as UserIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { ReportCard } from '../components/social/ReportCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import { useApp } from '../context/AppContext';
import { getInitials } from '../utils/formatters';

export function ProfilePage() {
  const { user, reports, deleteReport, logout } = useApp();
  const navigate = useNavigate();

  const [avatarError, setAvatarError] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [reportPendingDelete, setReportPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    setAvatarError(false);
  }, [user?.avatarUrl]);

  const userReports = useMemo(
    () => (user ? reports.filter((r) => r.userId === user.id) : []),
    [user, reports]
  );

  const uniqueBeachesCount = useMemo(
    () => new Set(userReports.map((r) => r.beachId)).size,
    [userReports]
  );

  const handleConfirmDelete = async () => {
    if (reportPendingDelete) {
      const targetId = reportPendingDelete;
      setReportPendingDelete(null);
      await deleteReport(targetId);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <AppLayout>
      {!user ? (
        <div className="mx-auto max-w-md py-4">
          <EmptyState
            icon={<UserIcon className="h-6 w-6" aria-hidden="true" />}
            title="Entre no Praiou?"
            description="Acesse sua conta para gerenciar seu perfil, acompanhar seus relatos e compartilhar fotos das praias do Rio."
            action={
              <Link
                to="/entrar"
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0284C7] px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 transition-colors"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Entrar agora
              </Link>
            }
          />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Card do perfil */}
          <Card padding="lg">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4 min-w-0">
                {user.avatarUrl && !avatarError ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarError(true)}
                    className="h-16 w-16 shrink-0 rounded-full border border-[#E2E8F0] object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-sky-100 font-display text-xl font-extrabold text-[#0284C7]">
                    {getInitials(user.name)}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <h1 className="truncate font-display text-xl font-bold text-[#0F172A]">
                    {user.name}
                  </h1>

                  <p className="mt-0.5 truncate text-sm text-[#475569]">
                    {user.email ? `${user.email} · ` : ''}Conta Google
                  </p>
                </div>
              </div>

              <Button
                variant="secondary"
                loading={isLoggingOut}
                disabled={isLoggingOut}
                onClick={handleLogout}
              >
                {!isLoggingOut && (
                  <LogOut className="h-4 w-4 text-[#475569]" aria-hidden="true" />
                )}
                {isLoggingOut ? 'Saindo...' : 'Sair'}
              </Button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
              <div>
                <span className="text-xs font-medium text-[#475569]">
                  Relatos publicados
                </span>
                <p className="mt-0.5 font-display text-2xl font-extrabold text-[#0F172A] tabular-nums">
                  {userReports.length}
                </p>
              </div>
              <div>
                <span className="text-xs font-medium text-[#475569]">
                  Praias avaliadas
                </span>
                <p className="mt-0.5 font-display text-2xl font-extrabold text-[#0F172A] tabular-nums">
                  {uniqueBeachesCount}
                </p>
              </div>
            </div>
          </Card>

          {/* Lista de relatos do usuário */}
          <section className="space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-[#0F172A]">
                Meus relatos{' '}
                <span className="text-[#475569] font-semibold tabular-nums">
                  ({userReports.length})
                </span>
              </h2>
              <Link
                to="/relatar"
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-[#0284C7] bg-white px-3.5 text-sm font-semibold text-[#0284C7] hover:bg-sky-50 transition-colors whitespace-nowrap"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Novo relato
              </Link>
            </div>

            {userReports.length === 0 ? (
              <EmptyState
                icon={<Plus className="h-6 w-6" aria-hidden="true" />}
                title="Você ainda não publicou relatos"
                description="Quando passar pela praia, conte em poucos segundos como estão o mar e a areia."
                action={
                  <Link
                    to="/relatar"
                    className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#0284C7] px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 transition-colors"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Publicar primeiro relato
                  </Link>
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {userReports.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    showBeachLink
                    onDeleteRequest={(id) => setReportPendingDelete(id)}
                  />
                ))}
              </div>
            )}
          </section>

          <ConfirmModal
            open={reportPendingDelete !== null}
            title="Excluir este relato?"
            description="Ele será removido do seu perfil e deixará de aparecer no feed da praia."
            confirmLabel="Excluir relato"
            cancelLabel="Manter"
            destructive
            onConfirm={handleConfirmDelete}
            onCancel={() => setReportPendingDelete(null)}
          />
        </div>
      )}
    </AppLayout>
  );
}
