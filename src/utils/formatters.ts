import type { PraiouStatus } from '../types';

export function getStatusMeta(status: PraiouStatus): {
  label: string;
  bgClass: string;
  textClass: string;
  accentHex: string;
  borderClass: string;
} {
  switch (status) {
    case 'praiou':
      return {
        label: 'Praiou',
        bgClass: 'bg-[#DCFCE7]',
        textClass: 'text-[#166534]',
        accentHex: '#10B981',
        borderClass: 'border-[#10B981]/30',
      };
    case 'talvez':
      return {
        label: 'Talvez praiar',
        bgClass: 'bg-[#FEF3C7]',
        textClass: 'text-[#92400E]',
        accentHex: '#F59E0B',
        borderClass: 'border-[#F59E0B]/30',
      };
    case 'nao_praiou':
      return {
        label: 'Não praiou',
        bgClass: 'bg-[#FEE2E2]',
        textClass: 'text-[#991B1B]',
        accentHex: '#EF4444',
        borderClass: 'border-[#EF4444]/30',
      };
  }
}

export function formatCompassDirection(deg: number): string {
  const dirs = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  const index = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return `${dirs[index]} (${Math.round(deg)}°)`;
}

export function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMin = Math.max(1, Math.floor(diffMs / 60000));

  if (diffMin < 60) {
    return `há ${diffMin} min`;
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return diffHours === 1 ? 'há 1 h' : `há ${diffHours} h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return diffDays === 1 ? 'ontem' : `há ${diffDays} dias`;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'PR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
