import { Star } from 'lucide-react';

interface StarRatingDisplayProps {
  rating: number;
}

export function StarRatingDisplay({ rating }: StarRatingDisplayProps) {
  return (
    <div
      className="inline-flex items-center gap-0.5 shrink-0"
      aria-label={`Nota ${rating} de 5 estrelas`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-3.5 w-3.5 ${
            star <= rating
              ? 'fill-amber-400 text-amber-400'
              : 'fill-transparent text-slate-300'
          }`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

interface StarRatingInputProps {
  value: 1 | 2 | 3 | 4 | 5 | null;
  onChange: (rating: 1 | 2 | 3 | 4 | 5) => void;
}

const RATING_LABELS: Record<number, string> = {
  1: 'Muito ruim',
  2: 'Não valeu',
  3: 'Razoável',
  4: 'Boa praia',
  5: 'Excelente',
};

export function StarRatingInput({ value, onChange }: StarRatingInputProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Nota da praia">
        {([1, 2, 3, 4, 5] as const).map((star) => {
          const active = value !== null && star <= value;
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={`${star} estrela${star > 1 ? 's' : ''} — ${RATING_LABELS[star]}`}
              onClick={() => onChange(star)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#E2E8F0] bg-white hover:border-[#0284C7]/50 focus-visible:outline-2 focus-visible:outline-[#0284C7] transition-colors active:scale-95"
            >
              <Star
                className={`h-6 w-6 transition-colors ${
                  active
                    ? 'fill-amber-400 text-amber-400'
                    : 'fill-transparent text-slate-300'
                }`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
      {value !== null && (
        <span className="text-sm font-medium text-[#475569] tabular-nums">
          {value}/5 · {RATING_LABELS[value]}
        </span>
      )}
    </div>
  );
}
