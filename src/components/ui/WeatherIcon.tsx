import { Cloud, CloudRain, CloudSun, Sun } from 'lucide-react';
import type { WeatherConditionType } from '../../types';

interface WeatherIconProps {
  condition: WeatherConditionType;
  className?: string;
}

export function WeatherIcon({ condition, className = 'h-5 w-5' }: WeatherIconProps) {
  switch (condition) {
    case 'sun':
      return <Sun className={`${className} text-amber-500`} aria-hidden="true" />;
    case 'partly_cloudy':
      return <CloudSun className={`${className} text-amber-500`} aria-hidden="true" />;
    case 'cloudy':
      return <Cloud className={`${className} text-slate-500`} aria-hidden="true" />;
    case 'rain':
      return <CloudRain className={`${className} text-[#0284C7]`} aria-hidden="true" />;
  }
}
