import { Cloud, CloudMoon, CloudRain, CloudSun, Moon, Sun } from 'lucide-react';
import type { WeatherConditionType } from '../../types';

interface WeatherIconProps {
  condition: WeatherConditionType;
  isNight?: boolean;
  className?: string;
}

export function WeatherIcon({
  condition,
  isNight = false,
  className = 'h-5 w-5',
}: WeatherIconProps) {
  switch (condition) {
    case 'sun':
      return isNight ? (
        <Moon className={`${className} text-slate-600`} aria-hidden="true" />
      ) : (
        <Sun className={`${className} text-amber-500`} aria-hidden="true" />
      );
    case 'partly_cloudy':
      return isNight ? (
        <CloudMoon className={`${className} text-slate-600`} aria-hidden="true" />
      ) : (
        <CloudSun className={`${className} text-amber-500`} aria-hidden="true" />
      );
    case 'cloudy':
      return <Cloud className={`${className} text-slate-500`} aria-hidden="true" />;
    case 'rain':
      return <CloudRain className={`${className} text-[#0284C7]`} aria-hidden="true" />;
  }
}
