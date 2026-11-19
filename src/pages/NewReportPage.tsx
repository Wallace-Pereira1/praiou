import { AlertTriangle, ArrowLeft, Camera, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { StarRatingInput } from '../components/ui/StarRating';
import { useApp } from '../context/AppContext';

export function NewReportPage() {
  const { beaches, addReport } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialBeach = beaches.find((b) => b.slug === searchParams.get('praia'));
  const devForceError = import.meta.env.DEV && searchParams.get('estado') === 'erro';

  const [beachId, setBeachId] = useState<string>(initialBeach?.id ?? '');
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [comment, setComment] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!beachId && initialBeach) {
      setBeachId(initialBeach.id);
    }
  }, [beachId, initialBeach]);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl && photoPreviewUrl !== submittedUrlRef.current) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  const handlePhotoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setPhotoFile(file);
    setPhotoPreviewUrl(objectUrl);
    setPhotoName(file.name);
    setErrorMessage(null);
  };

  const handleRemovePhoto = () => {
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!beachId) {
      setErrorMessage('Escolha a praia antes de publicar.');
      return;
    }

    if (rating === null) {
      setErrorMessage('Selecione uma nota de 1 a 5 estrelas.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (devForceError) {
        throw new Error('Erro simulado de envio');
      }

      if (photoPreviewUrl) {
        submittedUrlRef.current = photoPreviewUrl;
      }

      const created = await addReport({
        beachId,
        rating,
        comment,
        photoFile,
        photoPreviewUrl: photoPreviewUrl ?? undefined,
      });

      navigate('/feed', { state: { newReportId: created.id } });
    } catch {
      setErrorMessage(
        'Não foi possível publicar agora. Verifique sua conexão e tente novamente.'
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

            {/* Nota de 1 a 5 estrelas */}
            <div>
              <span className="block text-sm font-bold text-[#0F172A]">
                Como está a praia agora?
              </span>
              <p className="mt-0.5 text-xs text-[#475569]">
                Considere sol, vento e mar para ajudar quem vai agora.
              </p>
              <div className="mt-2.5">
                <StarRatingInput
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

            {/* Seleção de foto local */}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#0F172A]">Foto da praia</span>
                <Badge tone="neutral">Opcional</Badge>
              </div>
              <p className="mt-1 text-xs text-[#475569]">
                Mostre a areia ou o mar. Evite focar o rosto de outras pessoas.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                className="sr-only"
                id="report-photo-input"
              />

              {!photoPreviewUrl ? (
                <label
                  htmlFor="report-photo-input"
                  className="mt-2.5 flex min-h-[64px] cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-dashed border-[#0284C7]/50 bg-sky-50/50 px-4 py-4 text-sm font-semibold text-[#0284C7] hover:bg-sky-50 transition-colors"
                >
                  <Camera className="h-5 w-5" aria-hidden="true" />
                  Adicionar foto da galeria ou câmera
                </label>
              ) : (
                <div className="mt-2.5 space-y-2">
                  <div className="relative overflow-hidden rounded-xl border border-[#E2E8F0] bg-slate-100">
                    <img
                      src={photoPreviewUrl}
                      alt="Prévia da foto selecionada"
                      className="aspect-[16/10] w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      aria-label="Remover foto selecionada"
                      className="absolute right-2.5 top-2.5 min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-white/95 px-3 text-xs font-semibold text-[#991B1B] shadow-sm hover:bg-white transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Remover
                    </button>
                  </div>
                  {photoName && (
                    <p className="truncate text-xs text-[#475569]">{photoName}</p>
                  )}
                </div>
              )}
            </div>

            {/* Erro inline */}
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
      </main>
    </div>
  );
}
