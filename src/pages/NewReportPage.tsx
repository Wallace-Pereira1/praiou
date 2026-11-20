import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Loader2,
  LogIn,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthMethodsPanel } from '../components/auth/AuthMethodsPanel';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { useApp } from '../context/AppContext';
import * as reportsService from '../services/reports';
import type {
  BeachPostOption,
  ReportCrowdLevel,
  ReportSeaCondition,
  ReportSkyCondition,
} from '../types';
import {
  CROWD_LEVEL_OPTIONS,
  SEA_CONDITION_OPTIONS,
  SKY_CONDITION_OPTIONS,
  getDefaultPostsForBeachSlug,
  isValidPostForBeachPosts,
} from '../utils/reportConditions';
import {
  generateReportUuid,
  prepareReportImageForUpload,
} from '../utils/reportImage';

interface PendingSubmissionAttempt {
  reportId: string;
  uploadedPhotoPath: string | null;
  ambiguous: boolean;
}

function getSubmissionStageLabel(
  stage: reportsService.ReportSubmissionStage
): string {
  switch (stage) {
    case 'preparing':
      return 'Preparando relato...';
    case 'checking':
      return 'Verificando publicação...';
    case 'uploading':
      return 'Enviando foto...';
    case 'saving':
      return 'Salvando relato...';
  }
}

export function NewReportPage() {
  const { beaches, user, authReady } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const initialBeach = beaches.find((b) => b.slug === searchParams.get('praia'));

  const [beachId, setBeachId] = useState<string>(initialBeach?.id ?? '');
  const [postCode, setPostCode] = useState<string | null>(null);
  const [skyCondition, setSkyCondition] = useState<ReportSkyCondition | null>(null);
  const [seaCondition, setSeaCondition] = useState<ReportSeaCondition | null>(null);
  const [crowdLevel, setCrowdLevel] = useState<ReportCrowdLevel | null>(null);
  const [comment, setComment] = useState('');
  const [beachPostsMap, setBeachPostsMap] = useState<Map<
    string,
    BeachPostOption[]
  > | null>(null);

  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [preparedPhotoBlob, setPreparedPhotoBlob] = useState<Blob | null>(null);
  const [photoDimensions, setPhotoDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStage, setSubmissionStage] =
    useState<reportsService.ReportSubmissionStage>('preparing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const isSubmittingRef = useRef(false);
  const pendingAttemptRef = useRef<PendingSubmissionAttempt>({
    reportId: generateReportUuid(),
    uploadedPhotoPath: null,
    ambiguous: false,
  });

  useEffect(() => {
    let active = true;
    void reportsService.getBeachPostsMap().then((map) => {
      if (active && map) {
        setBeachPostsMap(map);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!beachId && initialBeach) {
      setBeachId(initialBeach.id);
    }
  }, [beachId, initialBeach]);

  const selectedBeach = useMemo(
    () => beaches.find((b) => b.id === beachId),
    [beaches, beachId]
  );

  const availablePosts = useMemo<BeachPostOption[]>(() => {
    if (!selectedBeach) return [];
    if (beachPostsMap) {
      return beachPostsMap.get(selectedBeach.id) ?? [];
    }
    return getDefaultPostsForBeachSlug(selectedBeach.slug);
  }, [selectedBeach, beachPostsMap]);

  useEffect(() => {
    if (postCode && !isValidPostForBeachPosts(postCode, availablePosts)) {
      setPostCode(null);
    }
  }, [postCode, availablePosts]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  const replacePreviewUrl = (nextUrl: string | null) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = nextUrl;
    setPhotoPreviewUrl(nextUrl);
  };

  const resetUploadedPhotoState = () => {
    pendingAttemptRef.current.uploadedPhotoPath = null;
    pendingAttemptRef.current.ambiguous = false;
  };

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!file || isSubmittingRef.current || isPreparingPhoto) return;

    setPhotoError(null);
    setErrorMessage(null);
    setIsPreparingPhoto(true);

    try {
      const prepared = await prepareReportImageForUpload(file);
      const nextPreviewUrl = URL.createObjectURL(prepared.blob);

      resetUploadedPhotoState();
      setPreparedPhotoBlob(prepared.blob);
      setPhotoDimensions({ width: prepared.width, height: prepared.height });
      replacePreviewUrl(nextPreviewUrl);
    } catch (err) {
      setPhotoError(
        err instanceof Error
          ? err.message
          : 'Não foi possível preparar a foto selecionada.'
      );
    } finally {
      setIsPreparingPhoto(false);
    }
  };

  const handleRemovePhoto = () => {
    if (isSubmittingRef.current || isPreparingPhoto) return;
    setPhotoError(null);
    setErrorMessage(null);
    resetUploadedPhotoState();
    setPreparedPhotoBlob(null);
    setPhotoDimensions(null);
    replacePreviewUrl(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || isPreparingPhoto) return;

    setErrorMessage(null);

    if (!user) {
      setErrorMessage('Entre com sua conta Google para publicar um relato.');
      return;
    }

    if (!beachId || !selectedBeach) {
      setErrorMessage('Escolha a praia antes de publicar.');
      return;
    }

    const safePostCode =
      postCode && isValidPostForBeachPosts(postCode, availablePosts)
        ? postCode
        : null;

    const attempt = pendingAttemptRef.current;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setSubmissionStage('preparing');

    try {
      const created = await reportsService.createReport(
        {
          beachId,
          postCode: safePostCode,
          skyCondition,
          seaCondition,
          crowdLevel,
          comment,
          reportId: attempt.reportId,
          photoBlob: preparedPhotoBlob,
          existingPhotoPath: attempt.uploadedPhotoPath,
          isRetryAfterAmbiguousError: attempt.ambiguous,
          fallbackDisplay: {
            beachSlug: selectedBeach.slug,
            beachName: selectedBeach.name,
            userName: user.name,
            userUsername: user.username,
            userAvatarUrl: user.avatarUrl,
          },
        },
        {
          onStageChange: (stage) => {
            setSubmissionStage(stage);
          },
          onPhotoUploaded: (photoPath) => {
            pendingAttemptRef.current.uploadedPhotoPath = photoPath;
          },
        }
      );

      pendingAttemptRef.current = {
        reportId: generateReportUuid(),
        uploadedPhotoPath: null,
        ambiguous: false,
      };

      navigate('/feed', {
        state: {
          newReportId: created.id,
          createdReport: created,
        },
      });
    } catch (err) {
      if (err instanceof reportsService.ReportPublishError) {
        pendingAttemptRef.current = {
          reportId: attempt.reportId,
          uploadedPhotoPath: err.ambiguous
            ? err.uploadedPhotoPath ?? attempt.uploadedPhotoPath
            : null,
          ambiguous: err.ambiguous,
        };
      } else {
        pendingAttemptRef.current = {
          reportId: attempt.reportId,
          uploadedPhotoPath: null,
          ambiguous: false,
        };
      }

      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Não foi possível publicar agora. Verifique sua conexão e tente novamente.'
      );
    } finally {
      isSubmittingRef.current = false;
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
            disabled={isSubmitting}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl px-2.5 -ml-2 text-sm font-semibold text-[#0F172A] hover:bg-slate-100 disabled:opacity-50 transition-colors"
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
              {/* Seletor de praia (obrigatório) */}
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
                  disabled={isSubmitting}
                  onChange={(e) => {
                    setBeachId(e.target.value);
                    setPostCode(null);
                    setErrorMessage(null);
                  }}
                  className="mt-2 min-h-[48px] w-full rounded-xl border border-[#E2E8F0] bg-white px-3.5 text-sm font-medium text-[#0F172A] focus:border-[#0284C7] focus:outline-none disabled:bg-slate-50"
                >
                  <option value="">Selecione uma praia...</option>
                  {beaches.map((beach) => (
                    <option key={beach.id} value={beach.id}>
                      {beach.name} · {beach.region}
                    </option>
                  ))}
                </select>
              </div>

              {/* Posto de salva-vidas (opcional e exibido apenas se a praia tiver postos cadastrados) */}
              {selectedBeach && availablePosts.length > 0 && (
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-[#0F172A]">
                      Posto
                    </span>
                    <Badge tone="neutral">Opcional</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-[#475569]">
                    Informe em qual posto de {selectedBeach.name} você está.
                  </p>
                  <div
                    role="group"
                    aria-label={`Posto em ${selectedBeach.name}`}
                    className="mt-2.5 flex flex-wrap gap-2"
                  >
                    {availablePosts.map((post) => {
                      const selected = postCode === post.code;
                      return (
                        <button
                          key={post.code}
                          type="button"
                          disabled={isSubmitting}
                          aria-pressed={selected}
                          onClick={() => {
                            setPostCode(selected ? null : post.code);
                            setErrorMessage(null);
                          }}
                          className={`min-h-[44px] rounded-xl px-3.5 py-2 text-xs sm:text-sm transition-colors focus-visible:outline-2 focus-visible:outline-[#0284C7] disabled:opacity-60 ${
                            selected
                              ? 'border-2 border-[#0284C7] bg-sky-50 font-bold text-[#0284C7]'
                              : 'border border-[#CBD5E1] bg-white font-medium text-[#334155] hover:border-[#0284C7]/60 hover:text-[#0F172A]'
                          }`}
                        >
                          {post.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Céu (opcional) */}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-[#0F172A]">Céu</span>
                  <Badge tone="neutral">Opcional</Badge>
                </div>
                <div
                  role="group"
                  aria-label="Condição do céu"
                  className="mt-2.5 flex flex-wrap gap-2"
                >
                  {SKY_CONDITION_OPTIONS.map((option) => {
                    const selected = skyCondition === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={isSubmitting}
                        aria-pressed={selected}
                        onClick={() => {
                          setSkyCondition(selected ? null : option.value);
                          setErrorMessage(null);
                        }}
                        className={`min-h-[44px] rounded-xl px-3.5 py-2 text-xs sm:text-sm transition-colors focus-visible:outline-2 focus-visible:outline-[#0284C7] disabled:opacity-60 ${
                          selected
                            ? 'border-2 border-[#0284C7] bg-sky-50 font-bold text-[#0284C7]'
                            : 'border border-[#CBD5E1] bg-white font-medium text-[#334155] hover:border-[#0284C7]/60 hover:text-[#0F172A]'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mar (opcional) */}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-[#0F172A]">Mar</span>
                  <Badge tone="neutral">Opcional</Badge>
                </div>
                <div
                  role="group"
                  aria-label="Condição do mar"
                  className="mt-2.5 flex flex-wrap gap-2"
                >
                  {SEA_CONDITION_OPTIONS.map((option) => {
                    const selected = seaCondition === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={isSubmitting}
                        aria-pressed={selected}
                        onClick={() => {
                          setSeaCondition(selected ? null : option.value);
                          setErrorMessage(null);
                        }}
                        className={`min-h-[44px] rounded-xl px-3.5 py-2 text-xs sm:text-sm transition-colors focus-visible:outline-2 focus-visible:outline-[#0284C7] disabled:opacity-60 ${
                          selected
                            ? 'border-2 border-[#0284C7] bg-sky-50 font-bold text-[#0284C7]'
                            : 'border border-[#CBD5E1] bg-white font-medium text-[#334155] hover:border-[#0284C7]/60 hover:text-[#0F172A]'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Nível de lotação (opcional) */}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-[#0F172A]">
                    Nível de lotação
                  </span>
                  <Badge tone="neutral">Opcional</Badge>
                </div>
                <div
                  role="group"
                  aria-label="Nível de lotação da praia"
                  className="mt-2.5 flex flex-wrap gap-2"
                >
                  {CROWD_LEVEL_OPTIONS.map((option) => {
                    const selected = crowdLevel === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={isSubmitting}
                        aria-pressed={selected}
                        onClick={() => {
                          setCrowdLevel(selected ? null : option.value);
                          setErrorMessage(null);
                        }}
                        className={`min-h-[44px] rounded-xl px-3.5 py-2 text-xs sm:text-sm transition-colors focus-visible:outline-2 focus-visible:outline-[#0284C7] disabled:opacity-60 ${
                          selected
                            ? 'border-2 border-[#0284C7] bg-sky-50 font-bold text-[#0284C7]'
                            : 'border border-[#CBD5E1] bg-white font-medium text-[#334155] hover:border-[#0284C7]/60 hover:text-[#0F172A]'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Comentário curto (único campo com contador de caracteres) */}
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
                  disabled={isSubmitting}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Ex.: Vento fraco, água limpa e mar tranquilo no Posto 9."
                  className="mt-2 w-full rounded-xl border border-[#E2E8F0] bg-white p-3.5 text-sm text-[#0F172A] placeholder:text-[#475569]/70 focus:border-[#0284C7] focus:outline-none resize-none disabled:bg-slate-50"
                />
              </div>

              {/* Foto opcional da praia (1 foto por relato) */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#0F172A]">Foto da praia</span>
                  <Badge tone="neutral">Opcional</Badge>
                </div>

                <input
                  ref={photoInputRef}
                  id="report-photo-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoChange}
                  disabled={isSubmitting || isPreparingPhoto}
                  className="sr-only"
                />

                {photoPreviewUrl && preparedPhotoBlob ? (
                  <div className="mt-2.5 space-y-2.5">
                    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-slate-50 p-2">
                      <img
                        src={photoPreviewUrl}
                        alt="Prévia da foto selecionada para o relato"
                        className="mx-auto block max-h-64 w-full rounded-lg object-contain"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="md"
                          disabled={isSubmitting || isPreparingPhoto}
                          onClick={() => photoInputRef.current?.click()}
                        >
                          <RefreshCw className="h-4 w-4" aria-hidden="true" />
                          Trocar foto
                        </Button>

                        <Button
                          type="button"
                          variant="secondary"
                          size="md"
                          disabled={isSubmitting || isPreparingPhoto}
                          onClick={handleRemovePhoto}
                          className="text-[#991B1B] border-[#EF4444]/30 hover:bg-[#FEE2E2]/50"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Remover foto
                        </Button>
                      </div>

                      {photoDimensions && (
                        <span className="text-xs text-[#475569] tabular-nums">
                          {photoDimensions.width}×{photoDimensions.height}px
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5">
                    <button
                      type="button"
                      disabled={isSubmitting || isPreparingPhoto}
                      onClick={() => photoInputRef.current?.click()}
                      className="flex min-h-[84px] w-full items-center justify-center gap-3 rounded-xl border border-dashed border-[#CBD5E1] bg-slate-50/70 px-4 py-4 text-sm font-semibold text-[#0284C7] hover:border-[#0284C7] hover:bg-sky-50/60 disabled:opacity-60 transition-colors"
                    >
                      {isPreparingPhoto ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                          <span>Preparando imagem...</span>
                        </>
                      ) : (
                        <>
                          <Camera className="h-5 w-5 shrink-0" aria-hidden="true" />
                          <span>Adicionar foto da praia</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                <p className="mt-2 text-xs text-[#475569]">
                  Formatos aceitos: JPEG, PNG ou WebP (máx. 5 MB). A foto será visível publicamente no relato.
                </p>

                {photoError && (
                  <div
                    role="alert"
                    className="mt-2 flex items-start gap-2 rounded-xl border border-[#EF4444]/30 bg-[#FEE2E2] px-3.5 py-2.5 text-xs font-medium text-[#991B1B]"
                  >
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{photoError}</span>
                  </div>
                )}
              </div>

              {/* Erro inline de publicação (mantém praia, sóis, comentário e foto) */}
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
                type="submit"
                size="lg"
                fullWidth
                loading={isSubmitting}
                disabled={isSubmitting || isPreparingPhoto}
              >
                {isSubmitting
                  ? getSubmissionStageLabel(submissionStage)
                  : 'Publicar relato'}
              </Button>
            </form>
          </Card>
        )}
      </main>
    </div>
  );
}
