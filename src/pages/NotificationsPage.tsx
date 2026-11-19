import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { EmptyState } from '../components/ui/EmptyState';

export function NotificationsPage() {
  return (
    <AppLayout>
      <div className="min-w-0 space-y-4 sm:space-y-5">
        <header>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F172A]">
            Notificações
          </h1>
          <p className="mt-1 text-sm text-[#475569]">
            Acompanhe por aqui os avisos da sua atividade no Praiou?.
          </p>
        </header>

        <EmptyState
          dashed
          icon={<Bell className="h-6 w-6" aria-hidden="true" />}
          title="Nenhuma notificação por enquanto"
          description="Quando houver avisos sobre a sua atividade, eles aparecerão aqui."
          action={
            <Link
              to="/feed"
              className="min-h-[44px] inline-flex items-center justify-center rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-semibold text-[#0F172A] hover:bg-slate-50 transition-colors"
            >
              Explorar feed
            </Link>
          }
        />
      </div>
    </AppLayout>
  );
}
