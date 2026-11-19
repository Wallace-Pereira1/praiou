/**
 * Praiou? — Cloudflare Worker de coleta automática (Dashboard Editor / ES Module)
 *
 * Responsabilidades:
 * - GET  /health       -> verificação simples de disponibilidade ({ ok: true })
 * - POST /api/refresh  -> atualização manual autenticada via Authorization: Bearer <REFRESH_SECRET_TOKEN>
 * - scheduled()        -> execução automática via Cron Trigger (ex.: a cada 30 minutos)
 *
 * Fontes:
 * - Open-Meteo Forecast API & Open-Meteo Marine API (estimativas de modelo, não medições locais)
 * - Persistência via Supabase REST API na tabela public.beach_snapshots (nunca na view latest_beach_snapshots)
 *
 * Observação sobre o índice:
 * - Pesos e limites (ex.: cap por ondas >= 2.0 m ou chuva >= 3.0 mm/h) são regras experimentais
 *   de produto, não critérios oficiais de balneabilidade ou segurança marítima.
 */

const REQUEST_TIMEOUT_MS = 8000;
const CONCURRENCY_LIMIT = 2;
const HOURLY_FORECAST_POINTS = 12;
const MIN_SCORE_WEIGHT_COVERAGE = 0.6;

const WEIGHTS = {
  rain: 0.3,
  wind: 0.2,
  wave: 0.22,
  skyAndTemp: 0.2,
  uv: 0.08,
};

const SAO_PAULO_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function roundIntOrNull(value, min = null, max = null) {
  const num = toFiniteNumberOrNull(value);
  if (num === null) return null;
  const rounded = Math.round(num);
  if (min !== null && max !== null) {
    return clamp(rounded, min, max);
  }
  return rounded;
}

function roundDecimalOrNull(value, decimals = 1) {
  const num = toFiniteNumberOrNull(value);
  if (num === null) return null;
  const factor = 10 ** decimals;
  return Math.round(num * factor) / factor;
}

function normalizeDirectionDeg(value) {
  const num = toFiniteNumberOrNull(value);
  if (num === null) return null;
  const wrapped = ((Math.round(num) % 360) + 360) % 360;
  return clamp(wrapped, 0, 360);
}

async function timingSafeEqualStrings(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) {
    return false;
  }

  const encoder = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);

  const bytesA = new Uint8Array(hashA);
  const bytesB = new Uint8Array(hashB);

  let diff = 0;
  for (let i = 0; i < bytesA.length; i += 1) {
    diff |= bytesA[i] ^ bytesB[i];
  }
  return diff === 0;
}

function extractBearerToken(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

function parseSupabaseBaseUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchActiveBeaches(supabaseBaseUrl, serviceRoleKey) {
  const url = `${supabaseBaseUrl}/rest/v1/beaches?select=id,slug,name,latitude,longitude&is_active=eq.true&order=sort_order.asc`;

  const data = await fetchJsonWithTimeout(url, {
    method: 'GET',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/json',
    },
  });

  if (!Array.isArray(data)) {
    throw new Error('Resposta inválida ao listar praias do Supabase');
  }

  return data.filter(
    (beach) =>
      beach &&
      typeof beach.id === 'string' &&
      typeof beach.slug === 'string' &&
      Number.isFinite(Number(beach.latitude)) &&
      Number.isFinite(Number(beach.longitude))
  );
}

async function fetchOpenMeteoForecast(beach) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(beach.latitude));
  url.searchParams.set('longitude', String(beach.longitude));
  url.searchParams.set('temperature_unit', 'celsius');
  url.searchParams.set('wind_speed_unit', 'kmh');
  url.searchParams.set('precipitation_unit', 'mm');
  url.searchParams.set('timezone', 'UTC');
  url.searchParams.set('timeformat', 'unixtime');
  url.searchParams.set('forecast_days', '2');
  url.searchParams.set(
    'current',
    'temperature_2m,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,uv_index'
  );
  url.searchParams.set(
    'hourly',
    'temperature_2m,precipitation_probability,precipitation,cloud_cover,wind_speed_10m,uv_index'
  );

  return fetchJsonWithTimeout(url.toString(), { method: 'GET' });
}

async function fetchOpenMeteoMarine(beach) {
  const url = new URL('https://marine-api.open-meteo.com/v1/marine');
  url.searchParams.set('latitude', String(beach.latitude));
  url.searchParams.set('longitude', String(beach.longitude));
  url.searchParams.set('timezone', 'UTC');
  url.searchParams.set('timeformat', 'unixtime');
  url.searchParams.set('forecast_days', '2');
  url.searchParams.set(
    'current',
    'wave_height,wave_direction,wave_period,sea_surface_temperature'
  );
  url.searchParams.set('hourly', 'wave_height,wave_direction,wave_period');

  return fetchJsonWithTimeout(url.toString(), { method: 'GET' });
}

function formatHourSaoPaulo(unixSeconds) {
  const date = new Date(unixSeconds * 1000);
  if (Number.isNaN(date.getTime())) return '--:--';
  try {
    return SAO_PAULO_TIME_FORMATTER.format(date);
  } catch {
    return '--:--';
  }
}

function buildTimeIndexMap(times) {
  const map = new Map();
  if (!Array.isArray(times)) return map;
  for (let i = 0; i < times.length; i += 1) {
    const ts = toFiniteNumberOrNull(times[i]);
    if (ts !== null) {
      map.set(ts, i);
    }
  }
  return map;
}

function findCurrentHourTimestamp(times, nowUnixSec) {
  if (!Array.isArray(times) || times.length === 0) return null;

  const exactCurrentHourSec = Math.floor(nowUnixSec / 3600) * 3600;
  if (times.includes(exactCurrentHourSec)) {
    return exactCurrentHourSec;
  }

  let bestTs = null;
  let smallestDiff = Infinity;
  for (let i = 0; i < times.length; i += 1) {
    const ts = toFiniteNumberOrNull(times[i]);
    if (ts === null) continue;
    const diff = Math.abs(ts - exactCurrentHourSec);
    if (diff < smallestDiff && diff <= 3600) {
      smallestDiff = diff;
      bestTs = ts;
    }
  }
  return bestTs;
}

function deriveCondition(cloudCover, rainProb, rainMm) {
  if ((rainMm !== null && rainMm >= 0.8) || (rainProb !== null && rainProb >= 60)) {
    return 'rain';
  }
  if (cloudCover === null) {
    return 'partly_cloudy';
  }
  if (cloudCover >= 70) return 'cloudy';
  if (cloudCover >= 30) return 'partly_cloudy';
  return 'sun';
}

function buildHourlyForecast(forecast, marine, nowUnixSec) {
  const forecastTimes = Array.isArray(forecast?.hourly?.time) ? forecast.hourly.time : [];
  const marineTimes = Array.isArray(marine?.hourly?.time) ? marine.hourly.time : [];

  const forecastByTime = buildTimeIndexMap(forecastTimes);
  const marineByTime = buildTimeIndexMap(marineTimes);

  const uniqueTimes = Array.from(
    new Set([...forecastByTime.keys(), ...marineByTime.keys()])
  ).sort((a, b) => a - b);

  if (uniqueTimes.length === 0) {
    return [];
  }

  const currentHourSec = Math.floor(nowUnixSec / 3600) * 3600;
  let upcomingTimes = uniqueTimes.filter((ts) => ts >= currentHourSec);
  if (upcomingTimes.length === 0) {
    upcomingTimes = uniqueTimes.filter((ts) => ts >= currentHourSec - 3600);
  }

  const selectedTimes = upcomingTimes.slice(0, HOURLY_FORECAST_POINTS);

  return selectedTimes.map((ts) => {
    const fIdx = forecastByTime.get(ts);
    const mIdx = marineByTime.get(ts);

    const temp =
      fIdx !== undefined ? roundIntOrNull(forecast?.hourly?.temperature_2m?.[fIdx]) : null;
    const rainProb =
      fIdx !== undefined
        ? roundIntOrNull(forecast?.hourly?.precipitation_probability?.[fIdx], 0, 100)
        : null;
    const rainMm =
      fIdx !== undefined ? roundDecimalOrNull(forecast?.hourly?.precipitation?.[fIdx], 1) : null;
    const cloudCover =
      fIdx !== undefined
        ? roundIntOrNull(forecast?.hourly?.cloud_cover?.[fIdx], 0, 100)
        : null;
    const waveHeight =
      mIdx !== undefined ? roundDecimalOrNull(marine?.hourly?.wave_height?.[mIdx], 1) : null;

    return {
      timeLabel: formatHourSaoPaulo(ts),
      condition: deriveCondition(cloudCover, rainProb, rainMm),
      temperatureC: temp,
      rainProb,
      waveHeightM: waveHeight,
    };
  });
}

function calculatePraiouScore(metrics) {
  const {
    temperatureC,
    rainProb,
    rainMm,
    windKmh,
    cloudCover,
    uvIndex,
    waveHeightM,
    wavePeriodS,
  } = metrics;

  let weightedSum = 0;
  let activeWeight = 0;

  // Prioridade menor = mais importante na exibição (máximo 3 motivos)
  const candidateReasons = [];
  const addReason = (priority, text) => {
    candidateReasons.push({ priority, text });
  };

  // 1. Chuva (peso 0.30) — só calcula se houver ao menos rainProb ou rainMm
  if (rainProb !== null || rainMm !== null) {
    const probPenalty = rainProb !== null ? rainProb * 0.7 : 0;
    const mmPenalty = rainMm !== null ? rainMm * 25 : 0;
    const rainScore = clamp(100 - probPenalty - mmPenalty);
    weightedSum += rainScore * WEIGHTS.rain;
    activeWeight += WEIGHTS.rain;

    if (rainMm !== null && rainMm >= 3.0) {
      addReason(1, 'Chuva forte estimada ou em curso agora');
    } else if ((rainProb !== null && rainProb >= 65) || (rainMm !== null && rainMm >= 1.0)) {
      addReason(1, 'Chance alta de chuva nas próximas horas');
    } else if (
      (rainProb === null || rainProb <= 20) &&
      (rainMm === null || rainMm < 0.2)
    ) {
      addReason(4, 'Baixa chance de chuva na previsão');
    }
  }

  // 2. Vento (peso 0.20)
  if (windKmh !== null) {
    const windScore = clamp(100 - Math.max(0, windKmh - 10) * 3.4);
    weightedSum += windScore * WEIGHTS.wind;
    activeWeight += WEIGHTS.wind;

    if (windKmh >= 25) {
      addReason(1, `Vento forte (${Math.round(windKmh)} km/h) pode levantar areia`);
    } else if (windKmh >= 18) {
      addReason(2, `Vento moderado (${Math.round(windKmh)} km/h) na orla`);
    } else {
      addReason(4, `Vento leve (${Math.round(windKmh)} km/h) na orla`);
    }
  }

  // 3. Ondas e período (peso 0.22)
  if (waveHeightM !== null) {
    let waveScore;
    if (waveHeightM <= 1.0) {
      waveScore = 95;
      addReason(4, `Ondas previstas mais baixas (${waveHeightM.toFixed(1)} m)`);
    } else if (waveHeightM < 2.0) {
      waveScore = clamp(95 - (waveHeightM - 1.0) * 48);
      addReason(2, `Ondas médias (${waveHeightM.toFixed(1)} m) pedem atenção na orla`);
    } else {
      waveScore = clamp(45 - (waveHeightM - 2.0) * 20);
      addReason(1, `Mar agitado (${waveHeightM.toFixed(1)} m) com ondas fortes na previsão`);
    }

    if (wavePeriodS !== null && wavePeriodS >= 12 && waveHeightM >= 1.4) {
      waveScore = clamp(waveScore - 10);
    }

    weightedSum += waveScore * WEIGHTS.wave;
    activeWeight += WEIGHTS.wave;
  } else {
    addReason(3, 'Dados de ondas indisponíveis nesta leitura');
  }

  // 4. Temperatura e nuvens (peso 0.20)
  if (temperatureC !== null || cloudCover !== null) {
    let tempPenalty = 0;
    if (temperatureC !== null) {
      if (temperatureC < 23) tempPenalty = (23 - temperatureC) * 9;
      else if (temperatureC > 36) tempPenalty = (temperatureC - 36) * 7;
    }
    const cloudPenalty = cloudCover !== null ? cloudCover * 0.45 : 0;
    const skyAndTempScore = clamp(100 - cloudPenalty - tempPenalty);

    weightedSum += skyAndTempScore * WEIGHTS.skyAndTemp;
    activeWeight += WEIGHTS.skyAndTemp;

    if (
      cloudCover !== null &&
      cloudCover <= 35 &&
      temperatureC !== null &&
      temperatureC >= 25
    ) {
      addReason(4, `Sol aparecendo bem e temperatura agradável (${Math.round(temperatureC)}°C)`);
    } else if (cloudCover !== null && cloudCover >= 80) {
      addReason(2, 'Céu bem encoberto com pouca abertura de sol');
    } else if (temperatureC !== null && temperatureC < 22) {
      addReason(2, `Temperatura mais fresca (${Math.round(temperatureC)}°C) na orla`);
    }
  }

  // 5. Índice UV (peso 0.08)
  if (uvIndex !== null) {
    const uvScore = uvIndex >= 10 ? 68 : uvIndex >= 8 ? 82 : 95;
    weightedSum += uvScore * WEIGHTS.uv;
    activeWeight += WEIGHTS.uv;

    if (uvIndex >= 8) {
      addReason(2, 'Radiação UV alta — reforce o protetor solar');
    }
  }

  // Critério mínimo de confiabilidade antes de publicar veredito
  const hasCoreAtmosphere =
    temperatureC !== null &&
    (rainProb !== null || rainMm !== null || windKmh !== null || cloudCover !== null);

  if (!hasCoreAtmosphere || activeWeight < MIN_SCORE_WEIGHT_COVERAGE) {
    return null;
  }

  let rawScore = weightedSum / activeWeight;

  // Limites experimentais por condições adversas (não são critérios oficiais de segurança)
  if (waveHeightM !== null && waveHeightM >= 2.0) {
    rawScore = Math.min(rawScore, 45);
  }
  if (rainMm !== null && rainMm >= 3.0) {
    rawScore = Math.min(rawScore, 40);
  }

  const score = Math.round(clamp(rawScore));
  const status = score >= 70 ? 'praiou' : score >= 45 ? 'talvez' : 'nao_praiou';

  let summaryReason;
  if (status === 'praiou') {
    summaryReason =
      cloudCover !== null && cloudCover <= 35
        ? 'Sol predominando e ondas mais baixas na previsão'
        : 'Clima agradável e mar mais calmo na previsão';
  } else if (status === 'talvez') {
    if (waveHeightM !== null && waveHeightM >= 2.0) {
      summaryReason = 'Mar agitado na previsão — evite entrar na água';
    } else if (windKmh !== null && windKmh >= 20) {
      summaryReason = 'Vento pode incomodar, mas vale checar';
    } else if (rainProb !== null && rainProb >= 40) {
      summaryReason = 'Tempo instável — vale checar antes de sair';
    } else if (waveHeightM === null) {
      summaryReason = 'Clima razoável, sem leitura atual de ondas';
    } else {
      summaryReason = 'Condições razoáveis, com atenção ao mar';
    }
  } else if (rainMm !== null && rainMm >= 2.0 && waveHeightM !== null && waveHeightM >= 1.8) {
    summaryReason = 'Chuva e mar agitado — melhor evitar';
  } else if (rainMm !== null && rainMm >= 2.0) {
    summaryReason = 'Chuva forte — melhor deixar para outro dia';
  } else if (waveHeightM !== null && waveHeightM >= 2.0) {
    summaryReason = 'Mar muito agitado — melhor evitar';
  } else {
    summaryReason = 'Clima fechado ou mar mexido — melhor adiar';
  }

  candidateReasons.sort((a, b) => a.priority - b.priority);
  const reasons = [];
  for (const item of candidateReasons) {
    if (!reasons.includes(item.text)) {
      reasons.push(item.text);
    }
    if (reasons.length === 3) break;
  }

  return {
    score,
    status,
    summaryReason,
    reasons,
  };
}

function buildSnapshotPayload(beach, forecast, marine, fetchedAtIso, nowUnixSec) {
  const forecastTimes = Array.isArray(forecast?.hourly?.time) ? forecast.hourly.time : [];
  const currentHourTs = findCurrentHourTimestamp(forecastTimes, nowUnixSec);
  const currentHourIdx =
    currentHourTs !== null ? forecastTimes.indexOf(currentHourTs) : -1;

  const temperatureC = roundDecimalOrNull(forecast?.current?.temperature_2m, 1);
  const rainMm = roundDecimalOrNull(forecast?.current?.precipitation, 1);

  const rainProbRaw =
    currentHourIdx >= 0 ? forecast?.hourly?.precipitation_probability?.[currentHourIdx] : null;
  const rainProb = roundIntOrNull(rainProbRaw, 0, 100);

  const windKmh = roundDecimalOrNull(forecast?.current?.wind_speed_10m, 1);
  const windDirDeg = normalizeDirectionDeg(forecast?.current?.wind_direction_10m);
  const cloudCover = roundIntOrNull(forecast?.current?.cloud_cover, 0, 100);

  const rawUv =
    forecast?.current?.uv_index ??
    (currentHourIdx >= 0 ? forecast?.hourly?.uv_index?.[currentHourIdx] : null);
  const uvIndex = roundDecimalOrNull(rawUv, 1);

  const waveHeightM = roundDecimalOrNull(marine?.current?.wave_height, 1);
  const wavePeriodS = roundDecimalOrNull(marine?.current?.wave_period, 1);
  const waveDirDeg = normalizeDirectionDeg(marine?.current?.wave_direction);
  const seaTempC = roundDecimalOrNull(marine?.current?.sea_surface_temperature, 1);

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

  if (!scored) {
    return null;
  }

  const missingCoreField =
    temperatureC === null ||
    rainProb === null ||
    rainMm === null ||
    windKmh === null ||
    cloudCover === null ||
    waveHeightM === null ||
    wavePeriodS === null;

  const sourceStatus = !forecast || !marine || missingCoreField ? 'partial' : 'ok';
  const hourlyForecast = buildHourlyForecast(forecast, marine, nowUnixSec);

  return {
    beach_id: beach.id,
    status: scored.status,
    score: scored.score,
    summary_reason: scored.summaryReason,
    reasons: scored.reasons,
    condition: deriveCondition(cloudCover, rainProb, rainMm),
    temperature_c: temperatureC,
    rain_prob: rainProb,
    rain_mm: rainMm,
    wind_kmh: windKmh,
    wind_dir_deg: windDirDeg,
    cloud_cover: cloudCover,
    uv_index: uvIndex,
    wave_height_m: waveHeightM,
    wave_period_s: wavePeriodS,
    wave_dir_deg: waveDirDeg,
    sea_temp_c: seaTempC,
    hourly_forecast: hourlyForecast,
    source_status: sourceStatus,
    fetched_at: fetchedAtIso,
  };
}

async function upsertSnapshots(supabaseBaseUrl, serviceRoleKey, rows) {
  if (rows.length === 0) return;

  const url = `${supabaseBaseUrl}/rest/v1/beach_snapshots?on_conflict=beach_id,fetched_at`;

  const response = await fetchJsonWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });

  return response;
}

async function mapWithConcurrency(items, limit, workerFn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIdx = nextIndex;
      nextIndex += 1;
      results[currentIdx] = await workerFn(items[currentIdx], currentIdx);
    }
  });

  await Promise.all(runners);
  return results;
}

async function syncAllBeaches(env) {
  const supabaseBaseUrl = parseSupabaseBaseUrl(env.SUPABASE_URL);
  const serviceRoleKey =
    typeof env.SUPABASE_SERVICE_ROLE_KEY === 'string'
      ? env.SUPABASE_SERVICE_ROLE_KEY.trim()
      : '';

  if (!supabaseBaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_CONFIG_MISSING');
  }

  const nowMs = Date.now();
  const nowUnixSec = Math.floor(nowMs / 1000);
  // Timestamp único por execução arredondado para o minuto UTC
  const fetchedAtIso = new Date(Math.floor(nowMs / 60000) * 60000).toISOString();

  const beaches = await fetchActiveBeaches(supabaseBaseUrl, serviceRoleKey);

  let partialCount = 0;
  let skippedCount = 0;
  const failures = [];
  const validRows = [];

  const outcomes = await mapWithConcurrency(beaches, CONCURRENCY_LIMIT, async (beach) => {
    const [forecastRes, marineRes] = await Promise.allSettled([
      fetchOpenMeteoForecast(beach),
      fetchOpenMeteoMarine(beach),
    ]);

    const forecast = forecastRes.status === 'fulfilled' ? forecastRes.value : null;
    const marine = marineRes.status === 'fulfilled' ? marineRes.value : null;

    if (!forecast && !marine) {
      return {
        type: 'failed',
        slug: beach.slug,
        reason: 'Open-Meteo Forecast e Marine indisponíveis',
      };
    }

    const row = buildSnapshotPayload(beach, forecast, marine, fetchedAtIso, nowUnixSec);
    if (!row) {
      return {
        type: 'skipped',
        slug: beach.slug,
        reason: 'Dados mínimos insuficientes para calcular o índice',
      };
    }

    return {
      type: 'ready',
      slug: beach.slug,
      row,
    };
  });

  for (const outcome of outcomes) {
    if (outcome.type === 'ready') {
      validRows.push(outcome.row);
      if (outcome.row.source_status === 'partial') {
        partialCount += 1;
      }
    } else if (outcome.type === 'skipped') {
      skippedCount += 1;
      failures.push({ slug: outcome.slug, reason: outcome.reason });
    } else {
      failures.push({ slug: outcome.slug, reason: outcome.reason });
    }
  }

  let savedCount = 0;
  if (validRows.length > 0) {
    try {
      await upsertSnapshots(supabaseBaseUrl, serviceRoleKey, validRows);
      savedCount = validRows.length;
    } catch {
      failures.push({
        slug: 'supabase_batch',
        reason: 'Falha ao gravar snapshots no Supabase',
      });
    }
  }

  return {
    ok: failures.length === 0 && savedCount > 0,
    fetchedAt: fetchedAtIso,
    processed: beaches.length,
    saved: savedCount,
    partial: partialCount,
    skipped: skippedCount,
    failures,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({ ok: true }, 200);
    }

    if (request.method === 'POST' && url.pathname === '/api/refresh') {
      const configuredToken =
        typeof env.REFRESH_SECRET_TOKEN === 'string' ? env.REFRESH_SECRET_TOKEN.trim() : '';

      if (!configuredToken) {
        console.error('[praiou-worker] REFRESH_SECRET_TOKEN não configurado');
        return jsonResponse({ error: 'Server configuration error' }, 500);
      }

      const providedToken = extractBearerToken(request);
      const isAuthorized = await timingSafeEqualStrings(providedToken, configuredToken);
      if (!isAuthorized) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }

      try {
        const summary = await syncAllBeaches(env);
        console.log(
          `[praiou-worker] refresh processed=${summary.processed} saved=${summary.saved} partial=${summary.partial} skipped=${summary.skipped} failures=${summary.failures.length}`
        );
        return jsonResponse(summary, summary.saved === 0 && summary.processed > 0 ? 502 : 200);
      } catch (error) {
        const message =
          error instanceof Error && error.message === 'SUPABASE_CONFIG_MISSING'
            ? 'Server configuration error'
            : 'Failed to synchronize beach snapshots';
        console.error('[praiou-worker] refresh error');
        return jsonResponse({ error: message }, 500);
      }
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },

  async scheduled(_event, env) {
    try {
      const summary = await syncAllBeaches(env);
      console.log(
        `[praiou-worker] cron processed=${summary.processed} saved=${summary.saved} partial=${summary.partial} skipped=${summary.skipped} failures=${summary.failures.length}`
      );
    } catch {
      console.error('[praiou-worker] cron execution failed');
    }
  },
};
