import { Sun } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';

interface SunRatingDisplayProps {
  rating: number;
}

export function formatSunCount(count: number): string {
  return count === 1 ? '1 sol' : `${count} sóis`;
}

export function SunRatingDisplay({ rating }: SunRatingDisplayProps) {
  const safeRating = Math.max(1, Math.min(5, Math.round(rating)));
  const accessibleText = `Avaliação: ${safeRating} de 5 sóis`;

  return (
    <div
      className="inline-flex items-center gap-1 shrink-0"
      role="img"
      aria-label={accessibleText}
      title={accessibleText}
    >
      <div className="inline-flex items-center gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((sun) => {
          const active = sun <= safeRating;
          return (
            <Sun
              key={sun}
              strokeWidth={active ? 2.2 : 1.75}
              className={`h-3.5 w-3.5 ${
                active
                  ? 'fill-amber-400 text-amber-500'
                  : 'fill-transparent text-slate-300'
              }`}
            />
          );
        })}
      </div>
      <span
        className="text-[11px] font-semibold text-[#475569] tabular-nums"
        aria-hidden="true"
      >
        {safeRating}/5
      </span>
    </div>
  );
}

interface SunRatingInputProps {
  value: 1 | 2 | 3 | 4 | 5 | null;
  onChange: (rating: 1 | 2 | 3 | 4 | 5) => void;
}

const RATING_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Muito ruim',
  2: 'Não valeu',
  3: 'Razoável',
  4: 'Boa praia',
  5: 'Excelente',
};

const RATING_STEPS: readonly (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5];

export function SunRatingInput({ value, onChange }: SunRatingInputProps) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    current: 1 | 2 | 3 | 4 | 5
  ) => {
    let next: 1 | 2 | 3 | 4 | 5 | null = null;

    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      next = (current < 5 ? current + 1 : 1) as 1 | 2 | 3 | 4 | 5;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      next = (current > 1 ? current - 1 : 5) as 1 | 2 | 3 | 4 | 5;
    } else if (e.key === 'Home') {
      next = 1;
    } else if (e.key === 'End') {
      next = 5;
    }

    if (next !== null) {
      e.preventDefault();
      onChange(next);
      buttonRefs.current[next - 1]?.focus();
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5">
      <div
        className="inline-flex items-center gap-1.5"
        role="radiogroup"
        aria-label="Quantos sóis essa praia merece?"
      >
        {RATING_STEPS.map((sun, index) => {
          const active = value !== null && sun <= value;
          const isExactSelected = value === sun;

          return (
            <button
              key={sun}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={isExactSelected}
              aria-label={`${formatSunCount(sun)} — ${RATING_LABELS[sun]}`}
              onClick={() => onChange(sun)}
              onKeyDown={(e) => handleKeyDown(e, sun)}
              className={`min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl border px-1.5 py-1 transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-[#0284C7] ${
                isExactSelected
                  ? 'border-2 border-amber-500 bg-amber-50 shadow-xs'
                  : active
                    ? 'border-amber-300 bg-amber-50/60 hover:border-amber-400'
                    : 'border-[#CBD5E1] bg-white hover:border-[#0284C7]/60'
              }`}
            >
              <Sun
                strokeWidth={active ? 2.2 : 1.75}
                className={`h-5 w-5 transition-colors ${
                  active
                    ? 'fill-amber-400 text-amber-500'
                    : 'fill-transparent text-slate-400'
                }`}
                aria-hidden="true"
              />
              <span
                className={`text-[10px] leading-none font-bold tabular-nums ${
                  active ? 'text-[#92400E]' : 'text-[#64748B]'
                }`}
                aria-hidden="true"
              >
                {sun}
              </span>
            </button>
          );
        })}
      </div>

      {value !== null && (
        <span className="text-sm font-semibold text-[#0F172A] tabular-nums">
          {formatSunCount(value)} · {RATING_LABELS[value]}
        </span>
      )}
    </div>
  );
}
