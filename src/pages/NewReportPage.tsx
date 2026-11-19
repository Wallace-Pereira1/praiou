import { AlertTriangle, ArrowLeft, Camera, Loader2, LogIn } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthMethodsPanel } from '../components/auth/AuthMethodsPanel';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { SunRatingInput } from '../components/ui/StarRating';
import { useApp } from '../context/AppContext';
import * as reportsService from '../services/reports';

export function NewReportPage() {
  const { beaches, user, authReady } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const initialBeach = beaches.find((b) => b.slug === searchParams.get('praia'));

  const [beachId, setBeachId] = useState<string>(initialBeach?.id ?? '');
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!beachId && initialBeach) {
      setBeachId(initialBeach.id);
    }
  }, [beachId, initialBeach]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!user) {
      setErrorMessage('Entre com sua conta Google para publicar um relato.');
      return;
    }

    if (!beachId) {
      setErrorMessage('Escolha a praia antes de publicar.');
      return;
    }

    if (rating === null) {
      setErrorMessage('Selecione uma avaliação de 1 a 5 sóis.');
      return;
    }

    setIsSubmitting(true);

    try {
      const created = await reportsService.createReport({
        beachId,
        rating,
        comment,
      });

      navigate('/feed', {
        state: {
          newReportId: created.id,
          createdReport: created,
        },
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Não foi possível publicar agora. Verifique sua conexão e tente novamente.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] pb-12">
      <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl px-2.5 -ml-2 text-sm font-semibold text-[#0F172A] hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar
          </button>

          <h1 className="font-display text-base font-bold text-[#0F172A]">Novo relato</h1>

          <div className="w-16" aria-hidden="true" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-5 sm:px-6">
        {!authReady ? (
          <Card padding="lg" className="p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-[#0284C7]">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            </div>
            <p className="mt-3 text-sm font-medium text-[#475569]">
              Verificando sua sessão...
            </p>
          </Card>
        ) : !user ? (
          <EmptyState
            icon={<LogIn className="h-6 w-6" aria-hidden="true" />}
            title="Entre para publicar seu relato"
            description="Os relatos são salvos na sua conta para ajudar outras pessoas a decidirem se deu praia."
            action={
              <AuthMethodsPanel
                returnTo={`${location.pathname}${location.search}`}
              />
            }
          />
        ) : (
          <Card padding="lg">
            <form onSubmit={handleSubmit} noValidate className="space-y-6">
              {/* Seletor de praia */}
              <div>
                <label
                  htmlFor="beach-select"
                  className="block text-sm font-bold text-[#0F172A]"
                >
                  Qual praia você está?
                </label>
                <select
                  id="beach-select"
                  value={beachId}
                  onChange={(e) => {
                    setBeachId(e.target.value);
                    setErrorMessage(null);
                  }}
                  className="mt-2 min-h-[48px] w-full rounded-xl border border-[#E2E8F0] bg-white px-3.5 text-sm font-medium text-[#0F172A] focus:border-[#0284C7] focus:outline-none"
                >
                  <option value="">Selecione uma praia...</option>
                  {beaches.map((beach) => (
                    <option key={beach.id} value={beach.id}>
                      {beach.name} · {beach.region}
                    </option>
                  ))}
                </select>
              </div>

              {/* Avaliação de 1 a 5 sóis */}
              <div>
                <span className="block text-sm font-bold text-[#0F172A]">
                  Quantos sóis essa praia merece?
                </span>
                <p className="mt-0.5 text-xs text-[#475569]">
                  Considere sol, vento e mar para ajudar quem vai agora.
                </p>
                <div className="mt-2.5">
                  <SunRatingInput
                    value={rating}
                    onChange={(val) => {
                      setRating(val);
                      setErrorMessage(null);
                    }}
                  />
                </div>
              </div>

              {/* Comentário curto */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="report-comment"
                      className="text-sm font-bold text-[#0F172A]"
                    >
                      Comentário curto
                    </label>
                    <Badge tone="neutral">Opcional</Badge>
                  </div>
                  <span
                    className={`text-xs tabular-nums ${
                      comment.length >= 165 ? 'text-[#92400E] font-semibold' : 'text-[#475569]'
                    }`}
                  >
                    {comment.length}/180
                  </span>
                </div>

                <textarea
                  id="report-comment"
                  rows={3}
                  maxLength={180}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Ex.: Vento fraco, água limpa e mar tranquilo no Posto 9."
                  className="mt-2 w-full rounded-xl border border-[#E2E8F0] bg-white p-3.5 text-sm text-[#0F172A] placeholder:text-[#475569]/70 focus:border-[#0284C7] focus:outline-none resize-none"
                />
              </div>

              {/* Foto desativada temporariamente (sem upload falso) */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#0F172A]">Foto da praia</span>
                  <Badge tone="neutral">Em breve</Badge>
                </div>
                <div className="mt-2 flex items-start gap-3 rounded-xl border border-dashed border-[#CBD5E1] bg-slate-50/80 px-4 py-3.5 text-xs text-[#475569]">
                  <Camera className="h-4 w-4 mt-0.5 shrink-0 text-[#64748B]" aria-hidden="true" />
                  <p className="leading-relaxed">
                    O envio de fotos estará disponível em breve. Nesta etapa, publique sua nota e comentário de texto em tempo real.
                  </p>
                </div>
              </div>

              {/* Erro inline (mantém o texto digitado) */}
              {errorMessage && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-[#EF4444]/30 bg-[#FEE2E2] px-3.5 py-3 text-sm text-[#991B1B]"
                >
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
                {isSubmitting ? 'Publicando relato...' : 'Publicar relato'}
              </Button>
            </form>
          </Card>
        )}
      </main>
    </div>
  );
}
