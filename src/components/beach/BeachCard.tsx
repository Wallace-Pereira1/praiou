import {
  ChevronRight,
  Clock,
  Droplets,
  Thermometer,
  Waves,
  Wind,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Beach, BeachSnapshot } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';
import { WeatherIcon } from '../ui/WeatherIcon';

interface BeachCardProps {
  beach: Beach;
  snapshot: BeachSnapshot;
}

export function BeachCard({ beach, snapshot }: BeachCardProps) {
  const isStale = snapshot.sourceStatus === 'stale';

  return (
    <Link
      to={`/praia/${beach.slug}`}
      className="group block rounded-2xl border border-[#E2E8F0] bg-white p-4 sm:p-5 transition-colors hover:border-[#0284C7]/55 focus-visible:outline-2 focus-visible:outline-[#0284C7]"
    >
      {/* Topo com hierarquia forte: Praia + Veredito dominante */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <WeatherIcon condition={snapshot.condition} className="h-5 w-5 shrink-0" />
            <h2 className="truncate font-display text-lg sm:text-xl font-extrabold tracking-tight text-[#0F172A] group-hover:text-[#0284C7] transition-colors">
              {beach.name}
            </h2>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#475569]">
            <span>{beach.region}</span>
            <span aria-hidden="true">·</span>
            <span
              className={`inline-flex items-center gap-1 tabular-nums ${
                isStale ? 'text-[#92400E] font-semibold' : ''
              }`}
            >
              <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
              {isStale
                ? `Última leitura às ${snapshot.updatedAtLabel}`
                : `Atualizado às ${snapshot.updatedAtLabel}`}
            </span>
          </div>
        </div>

        <StatusBadge status={snapshot.status} size="md" />
      </div>

      {/* Frase explicativa natural e imediata */}
      <p className="mt-3 text-sm font-medium text-[#0F172A] line-clamp-1">
        {snapshot.summaryReason}
      </p>

      {/* Métricas essenciais em linha única escaneável */}
      <div className="mt-3.5 grid grid-cols-4 gap-2 border-t border-slate-100 pt-3">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1 text-[11px] font-medium text-[#475569]">
            <Thermometer className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
            Temp
          </span>
          <span className="text-sm sm:text-base font-bold text-[#0F172A] tabular-nums">
            {snapshot.temperatureC !== null ? `${snapshot.temperatureC}°C` : '—'}
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1 text-[11px] font-medium text-[#475569]">
            <Droplets className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
            Chuva
          </span>
          <span className="text-sm sm:text-base font-bold text-[#0F172A] tabular-nums">
            {snapshot.rainProb !== null ? `${snapshot.rainProb}%` : '—'}
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1 text-[11px] font-medium text-[#475569]">
            <Wind className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
            Vento
          </span>
          <span className="text-sm sm:text-base font-bold text-[#0F172A] tabular-nums">
            {snapshot.windKmh !== null ? `${snapshot.windKmh} km/h` : '—'}
          </span>
        </div>

        <div className="flex items-end justify-between gap-1">
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1 text-[11px] font-medium text-[#475569]">
              <Waves className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
              Ondas
            </span>
            <span className="text-sm sm:text-base font-bold text-[#0F172A] tabular-nums">
              {snapshot.waveHeightM !== null ? `${snapshot.waveHeightM.toFixed(1)} m` : '—'}
            </span>
          </div>
          <ChevronRight
            className="h-4 w-4 shrink-0 text-[#475569] group-hover:translate-x-0.5 group-hover:text-[#0284C7] transition-transform mb-0.5"
            aria-hidden="true"
          />
        </div>
      </div>
    </Link>
  );
}
