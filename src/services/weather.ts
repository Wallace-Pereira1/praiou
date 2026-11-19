import type {
  Beach,
  BeachSnapshot,
  HourlyForecastPoint,
  SnapshotSourceStatus,
  WeatherConditionType,
} from '../types';
import { calculatePraiouScore } from '../utils/praiouScore';

interface OpenMeteoForecastResponse {
  current?: {
    time?: string;
    temperature_2m?: number;
    precipitation?: number;
    cloud_cover?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    uv_index?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    precipitation_probability?: (number | null)[];
    precipitation?: (number | null)[];
    cloud_cover?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    uv_index?: (number | null)[];
  };
}

interface OpenMeteoMarineResponse {
  current?: {
    time?: string;
    wave_height?: number | null;
    wave_direction?: number | null;
    wave_period?: number | null;
    sea_surface_temperature?: number | null;
  };
  hourly?: {
    time?: string[];
    wave_height?: (number | null)[];
    wave_direction?: (number | null)[];
    wave_period?: (number | null)[];
  };
}

const REQUEST_TIMEOUT_MS = 8000;

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Open-Meteo retornou HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function deriveCondition(
  cloudCover: number | null,
  rainProb: number | null,
  rainMm: number | null
): WeatherConditionType {
  if ((rainMm ?? 0) >= 0.8 || (rainProb ?? 0) >= 60) {
    return 'rain';
  }
  const clouds = cloudCover ?? 30;
  if (clouds >= 70) return 'cloudy';
  if (clouds >= 30) return 'partly_cloudy';
  return 'sun';
}

function formatHourLabel(isoTime: string): string {
  const match = isoTime.match(/T(\d{2}:\d{2})/);
  if (match) return match[1];
  const parsed = new Date(isoTime);
  if (Number.isNaN(parsed.getTime())) return isoTime.slice(0, 5);
  return `${String(parsed.getHours()).padStart(2, '0')}:${String(
    parsed.getMinutes()
  ).padStart(2, '0')}`;
}

function formatNowHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes()
  ).padStart(2, '0')}`;
}

function findCurrentHourIndex(times: string[]): number {
  if (times.length === 0) return 0;
  const now = new Date();
  const currentHourPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(
    2,
    '0'
  )}`;

  const exactIdx = times.findIndex((t) => t.startsWith(currentHourPrefix));
  if (exactIdx !== -1) return exactIdx;

  const nowMs = now.getTime();
  const futureIdx = times.findIndex((t) => {
    const ms = Date.parse(t);
    return !Number.isNaN(ms) && ms >= nowMs - 3600_000;
  });
  return futureIdx !== -1 ? futureIdx : 0;
}

export async function fetchWeatherForBeach(
  beach: Beach
): Promise<OpenMeteoForecastResponse> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(beach.latitude));
  url.searchParams.set('longitude', String(beach.longitude));
  url.searchParams.set('timezone', 'America/Sao_Paulo');
  url.searchParams.set('forecast_days', '2');
  url.searchParams.set(
    'current',
    'temperature_2m,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,uv_index'
  );
  url.searchParams.set(
    'hourly',
    'temperature_2m,precipitation_probability,precipitation,cloud_cover,wind_speed_10m,uv_index'
  );

  return fetchJsonWithTimeout<OpenMeteoForecastResponse>(url.toString());
}

export async function fetchMarineForBeach(
  beach: Beach
): Promise<OpenMeteoMarineResponse> {
  const url = new URL('https://marine-api.open-meteo.com/v1/marine');
  url.searchParams.set('latitude', String(beach.latitude));
  url.searchParams.set('longitude', String(beach.longitude));
  url.searchParams.set('timezone', 'America/Sao_Paulo');
  url.searchParams.set('forecast_days', '2');
  url.searchParams.set(
    'current',
    'wave_height,wave_direction,wave_period,sea_surface_temperature'
  );
  url.searchParams.set('hourly', 'wave_height,wave_direction,wave_period');

  return fetchJsonWithTimeout<OpenMeteoMarineResponse>(url.toString());
}

export function buildHourlyForecast(
  forecast: OpenMeteoForecastResponse | null,
  marine: OpenMeteoMarineResponse | null
): HourlyForecastPoint[] {
  const forecastTimes = forecast?.hourly?.time ?? [];
  const marineTimes = marine?.hourly?.time ?? [];
  const baseTimes = forecastTimes.length > 0 ? forecastTimes : marineTimes;

  if (baseTimes.length === 0) {
    return [];
  }

  const startIdx = findCurrentHourIndex(baseTimes);
  const selectedTimes = baseTimes.slice(startIdx, startIdx + 12);

  // Mapa por timestamp ISO para combinar horários mesmo se as duas APIs diferirem em offset
  const forecastByTime = new Map<string, number>();
  forecastTimes.forEach((t, idx) => forecastByTime.set(t, idx));

  const marineByTime = new Map<string, number>();
  marineTimes.forEach((t, idx) => marineByTime.set(t, idx));

  return selectedTimes.map((timeStr) => {
    const fIdx = forecastByTime.get(timeStr);
    const mIdx = marineByTime.get(timeStr);

    const temp =
      fIdx !== undefined ? (forecast?.hourly?.temperature_2m?.[fIdx] ?? null) : null;
    const rainProb =
      fIdx !== undefined
        ? (forecast?.hourly?.precipitation_probability?.[fIdx] ?? null)
        : null;
    const rainMm =
      fIdx !== undefined ? (forecast?.hourly?.precipitation?.[fIdx] ?? null) : null;
    const cloudCover =
      fIdx !== undefined ? (forecast?.hourly?.cloud_cover?.[fIdx] ?? null) : null;
    const waveHeight =
      mIdx !== undefined ? (marine?.hourly?.wave_height?.[mIdx] ?? null) : null;

    return {
      timeLabel: formatHourLabel(timeStr),
      condition: deriveCondition(cloudCover, rainProb, rainMm),
      temperatureC: temp !== null ? Math.round(temp) : null,
      rainProb: rainProb !== null ? Math.round(rainProb) : null,
      waveHeightM: waveHeight !== null ? Number(waveHeight.toFixed(1)) : null,
    };
  });
}

export async function fetchLiveConditionsForBeach(
  beach: Beach,
  fallbackSnapshot?: BeachSnapshot
): Promise<BeachSnapshot> {
  const [forecastRes, marineRes] = await Promise.allSettled([
    fetchWeatherForBeach(beach),
    fetchMarineForBeach(beach),
  ]);

  const forecast = forecastRes.status === 'fulfilled' ? forecastRes.value : null;
  const marine = marineRes.status === 'fulfilled' ? marineRes.value : null;

  if (!forecast && !marine) {
    throw new Error(`Ambas APIs Open-Meteo falharam para ${beach.slug}`);
  }

  const sourceStatus: SnapshotSourceStatus =
    forecast && marine ? 'ok' : 'partial';

  const forecastTimes = forecast?.hourly?.time ?? [];
  const currentHourIdx = findCurrentHourIndex(forecastTimes);

  const temperatureC =
    forecast?.current?.temperature_2m !== undefined
      ? Math.round(forecast.current.temperature_2m)
      : (fallbackSnapshot?.temperatureC ?? null);

  const rainMm =
    forecast?.current?.precipitation !== undefined
      ? Number(forecast.current.precipitation.toFixed(1))
      : (fallbackSnapshot?.rainMm ?? null);

  const rainProbRaw = forecast?.hourly?.precipitation_probability?.[currentHourIdx];
  const rainProb =
    rainProbRaw !== undefined && rainProbRaw !== null
      ? Math.round(rainProbRaw)
      : (fallbackSnapshot?.rainProb ?? null);

  const windKmh =
    forecast?.current?.wind_speed_10m !== undefined
      ? Math.round(forecast.current.wind_speed_10m)
      : (fallbackSnapshot?.windKmh ?? null);

  const windDirDeg =
    forecast?.current?.wind_direction_10m !== undefined
      ? Math.round(forecast.current.wind_direction_10m)
      : (fallbackSnapshot?.windDirDeg ?? null);

  const cloudCover =
    forecast?.current?.cloud_cover !== undefined
      ? Math.round(forecast.current.cloud_cover)
      : (fallbackSnapshot?.cloudCover ?? null);

  const rawUv =
    forecast?.current?.uv_index ??
    forecast?.hourly?.uv_index?.[currentHourIdx] ??
    null;
  const uvIndex =
    rawUv !== null ? Number(rawUv.toFixed(1)) : (fallbackSnapshot?.uvIndex ?? null);

  const waveHeightM =
    marine?.current?.wave_height !== undefined && marine.current.wave_height !== null
      ? Number(marine.current.wave_height.toFixed(1))
      : (fallbackSnapshot?.waveHeightM ?? null);

  const wavePeriodS =
    marine?.current?.wave_period !== undefined && marine.current.wave_period !== null
      ? Math.round(marine.current.wave_period)
      : (fallbackSnapshot?.wavePeriodS ?? null);

  const waveDirDeg =
    marine?.current?.wave_direction !== undefined && marine.current.wave_direction !== null
      ? Math.round(marine.current.wave_direction)
      : (fallbackSnapshot?.waveDirDeg ?? null);

  const seaTempC =
    marine?.current?.sea_surface_temperature !== undefined &&
    marine.current.sea_surface_temperature !== null
      ? Math.round(marine.current.sea_surface_temperature)
      : (fallbackSnapshot?.seaTempC ?? null);

  const hourlyForecast = buildHourlyForecast(forecast, marine);
  const scored = calculatePraiouScore({
    temperatureC,
    rainProb,
    rainMm,
    windKmh,
    cloudCover,
    uvIndex,
    waveHeightM,
    wavePeriodS,
  });

  return {
    id: `snap-live-${beach.slug}`,
    beachId: beach.id,
    status: scored.status,
    score: scored.score,
    summaryReason: scored.summaryReason,
    reasons: scored.reasons,
    condition: deriveCondition(cloudCover, rainProb, rainMm),
    temperatureC,
    rainProb,
    rainMm,
    windKmh,
    windDirDeg,
    cloudCover,
    uvIndex,
    waveHeightM,
    wavePeriodS,
    waveDirDeg,
    seaTempC,
    hourlyForecast:
      hourlyForecast.length > 0
        ? hourlyForecast
        : (fallbackSnapshot?.hourlyForecast ?? []),
    sourceStatus,
    updatedAtLabel: formatNowHHMM(),
  };
}
