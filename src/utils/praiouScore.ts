import type { PraiouStatus } from '../types';

export interface PraiouScoreInput {
  temperatureC: number | null;
  rainProb: number | null;
  rainMm: number | null;
  windKmh: number | null;
  cloudCover: number | null;
  uvIndex: number | null;
  waveHeightM: number | null;
  wavePeriodS: number | null;
}

export type ScoreFactorKey =
  | 'skyAndSun'
  | 'temperature'
  | 'wave'
  | 'wind'
  | 'rain';

export interface ScoreComponentEvaluation {
  key: ScoreFactorKey;
  nominalWeight: number;
  subScore: number | null;
}

export interface PraiouScoreResult {
  score: number;
  status: PraiouStatus;
  summaryReason: string;
  reasons: string[];
  components: Record<ScoreFactorKey, ScoreComponentEvaluation>;
  activeWeight: number;
  appliedCap: 40 | 45 | null;
}

export const PRAIOU_SCORE_WEIGHTS: Record<ScoreFactorKey, number> = {
  skyAndSun: 0.3,
  temperature: 0.2,
  wave: 0.2,
  wind: 0.15,
  rain: 0.15,
};

const MIN_SCORE_WEIGHT_COVERAGE = 0.6;

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 1. Céu e sol (30%): usa cobertura de nuvens e índice UV.
 * - Menos nuvens aumenta a pontuação; mais nuvens reduz de forma perceptível.
 * - Preserva o cálculo de UV (>=10 -> 68, >=8 -> 82, <8 -> 95) sem zerar o índice.
 */
export function evaluateSkyAndSunSubScore(
  cloudCover: number | null,
  uvIndex: number | null
): number | null {
  if (cloudCover === null && uvIndex === null) {
    return null;
  }

  const cloudScore =
    cloudCover !== null ? clamp(100 - cloudCover * 0.75) : null;
  const uvScore =
    uvIndex !== null ? (uvIndex >= 10 ? 68 : uvIndex >= 8 ? 82 : 95) : null;

  if (cloudScore !== null && uvScore !== null) {
    return clamp(cloudScore * 0.85 + uvScore * 0.15);
  }
  return cloudScore ?? uvScore;
}

/**
 * 2. Temperatura (20%):
 * - Calor agradável e quente (26°C–33°C) pontua melhor.
 * - Abaixo de 23°C reduz a pontuação.
 * - Acima de 36°C reduz por calor excessivo; calor extremo nunca recebe nota máxima.
 */
export function evaluateTemperatureSubScore(
  temperatureC: number | null
): number | null {
  if (temperatureC === null) {
    return null;
  }

  if (temperatureC < 23) {
    return clamp(88 - (23 - temperatureC) * 9);
  }
  if (temperatureC < 26) {
    return clamp(88 + (temperatureC - 23) * 4);
  }
  if (temperatureC <= 33) {
    return 100;
  }
  if (temperatureC <= 36) {
    return clamp(100 - (temperatureC - 33) * 4);
  }
  return clamp(88 - (temperatureC - 36) * 8);
}

/**
 * 3. Mar e ondas (20%):
 * - Prioriza condições mais calmas para nadar (ondulação baixa a moderada).
 * - Considera período das ondas quando disponível.
 */
export function evaluateWaveSubScore(
  waveHeightM: number | null,
  wavePeriodS: number | null
): number | null {
  if (waveHeightM === null) {
    return null;
  }

  let waveScore: number;
  if (waveHeightM <= 0.8) {
    waveScore = 98;
  } else if (waveHeightM <= 1.0) {
    waveScore = clamp(98 - (waveHeightM - 0.8) * 15);
  } else if (waveHeightM < 1.5) {
    waveScore = clamp(95 - (waveHeightM - 1.0) * 40);
  } else if (waveHeightM < 2.0) {
    waveScore = clamp(75 - (waveHeightM - 1.5) * 56);
  } else {
    waveScore = clamp(45 - (waveHeightM - 2.0) * 20);
  }

  if (wavePeriodS !== null && wavePeriodS >= 12 && waveHeightM >= 1.2) {
    waveScore = clamp(waveScore - 10);
  }

  return waveScore;
}

/**
 * 4. Vento (15%):
 * - Vento leve a moderado (6–18 km/h) ajuda a refrescar e pontua bem.
 * - Vento muito fraco (< 6 km/h) fica neutro/levemente positivo conforme a temperatura.
 * - Vento forte (> 18–25+ km/h) reduz a pontuação.
 * (Usa apenas vento médio disponível na fonte, sem inventar rajadas.)
 */
export function evaluateWindSubScore(
  windKmh: number | null,
  temperatureC: number | null
): number | null {
  if (windKmh === null) {
    return null;
  }

  if (windKmh < 6) {
    if (temperatureC !== null && temperatureC >= 30) {
      return 82;
    }
    if (temperatureC !== null && temperatureC >= 27) {
      return 86;
    }
    return 90;
  }

  if (windKmh <= 15) {
    return 100;
  }

  if (windKmh <= 18) {
    return clamp(100 - (windKmh - 15) * 4.5);
  }

  if (windKmh < 25) {
    return clamp(86.5 - (windKmh - 18) * 5);
  }

  return clamp(51.5 - (windKmh - 25) * 3.5);
}

/**
 * 5. Chuva (15%):
 * - Chance de chuva e volume previsto reduzem a pontuação sem punir duas vezes
 *   o mesmo evento de forma desproporcional.
 */
export function evaluateRainSubScore(
  rainProb: number | null,
  rainMm: number | null
): number | null {
  if (rainProb === null && rainMm === null) {
    return null;
  }

  const probPenalty = rainProb !== null ? rainProb * 0.85 : 0;
  const mmPenalty = rainMm !== null ? Math.min(90, rainMm * 32) : 0;
  const combinedPenalty =
    Math.max(probPenalty, mmPenalty) + Math.min(probPenalty, mmPenalty) * 0.25;

  return clamp(100 - combinedPenalty);
}

export function evaluatePraiouScoreComponents(input: PraiouScoreInput): {
  components: Record<ScoreFactorKey, ScoreComponentEvaluation>;
  activeWeight: number;
  weightedSum: number;
} {
  const skyAndSunSub = evaluateSkyAndSunSubScore(
    input.cloudCover,
    input.uvIndex
  );
  const temperatureSub = evaluateTemperatureSubScore(input.temperatureC);
  const waveSub = evaluateWaveSubScore(input.waveHeightM, input.wavePeriodS);
  const windSub = evaluateWindSubScore(input.windKmh, input.temperatureC);
  const rainSub = evaluateRainSubScore(input.rainProb, input.rainMm);

  const components: Record<ScoreFactorKey, ScoreComponentEvaluation> = {
    skyAndSun: {
      key: 'skyAndSun',
      nominalWeight: PRAIOU_SCORE_WEIGHTS.skyAndSun,
      subScore: skyAndSunSub,
    },
    temperature: {
      key: 'temperature',
      nominalWeight: PRAIOU_SCORE_WEIGHTS.temperature,
      subScore: temperatureSub,
    },
    wave: {
      key: 'wave',
      nominalWeight: PRAIOU_SCORE_WEIGHTS.wave,
      subScore: waveSub,
    },
    wind: {
      key: 'wind',
      nominalWeight: PRAIOU_SCORE_WEIGHTS.wind,
      subScore: windSub,
    },
    rain: {
      key: 'rain',
      nominalWeight: PRAIOU_SCORE_WEIGHTS.rain,
      subScore: rainSub,
    },
  };

  let activeWeight = 0;
  let weightedSum = 0;

  for (const key of Object.keys(components) as ScoreFactorKey[]) {
    const item = components[key];
    if (item.subScore !== null) {
      activeWeight += item.nominalWeight;
      weightedSum += item.subScore * item.nominalWeight;
    }
  }

  return { components, activeWeight, weightedSum };
}

export function hasMinimumMetricsForScore(input: PraiouScoreInput): boolean {
  const hasCoreAtmosphere =
    input.temperatureC !== null &&
    (input.rainProb !== null ||
      input.rainMm !== null ||
      input.windKmh !== null ||
      input.cloudCover !== null);

  if (!hasCoreAtmosphere) {
    return false;
  }

  const { activeWeight } = evaluatePraiouScoreComponents(input);
  return activeWeight >= MIN_SCORE_WEIGHT_COVERAGE;
}

export function calculatePraiouScore(
  input: PraiouScoreInput
): PraiouScoreResult {
  const { components, activeWeight, weightedSum } =
    evaluatePraiouScoreComponents(input);

  const rainProb = input.rainProb ?? 0;
  const rainMm = input.rainMm ?? 0;
  const wind = input.windKmh ?? 12;
  const temp = input.temperatureC ?? 26;
  const clouds = input.cloudCover ?? 30;
  const uv = input.uvIndex ?? 5;
  const waveHeight = input.waveHeightM;

  let rawScore = activeWeight > 0 ? weightedSum / activeWeight : 50;

  // Limites de segurança preservados para ondas altas e chuva forte
  let appliedCap: 40 | 45 | null = null;
  if (waveHeight !== null && waveHeight >= 2.0) {
    rawScore = Math.min(rawScore, 45);
    appliedCap = 45;
  }
  if (input.rainMm !== null && input.rainMm >= 3.0) {
    rawScore = Math.min(rawScore, 40);
    appliedCap = 40;
  }

  const score = roundOneDecimal(clamp(rawScore));
  const status: PraiouStatus =
    score >= 70 ? 'praiou' : score >= 45 ? 'talvez' : 'nao_praiou';

  const reasons: string[] = [];

  if (rainMm >= 3.0) {
    reasons.push('Chuva forte prevista limita o índice e pede cautela');
  } else if (rainProb >= 65 || rainMm >= 1.0) {
    reasons.push('Chance alta de chuva reduz a estimativa nas próximas horas');
  } else if (rainProb <= 20 && rainMm < 0.2) {
    reasons.push('Baixa chance de chuva na previsão');
  }

  if (clouds <= 30 && temp >= 25 && temp <= 35) {
    reasons.push(
      `Céu mais limpo (${Math.round(clouds)}% de nuvens) e calor agradável (${Math.round(temp)}°C)`
    );
  } else if (clouds >= 75) {
    reasons.push(`Céu bem encoberto (${Math.round(clouds)}% de nuvens) reduz a abertura de sol`);
  } else if (temp < 23) {
    reasons.push(`Temperatura mais fresca (${Math.round(temp)}°C) reduz o conforto na areia`);
  } else if (temp > 36) {
    reasons.push(`Calor intenso (${Math.round(temp)}°C) reduz o conforto térmico`);
  }

  if (waveHeight !== null) {
    if (waveHeight <= 1.0) {
      reasons.push(`Ondas baixas (${waveHeight.toFixed(1)} m) na estimativa; observe bandeiras no local`);
    } else if (waveHeight < 2.0) {
      reasons.push(`Ondas médias (${waveHeight.toFixed(1)} m) pedem atenção na orla`);
    } else {
      reasons.unshift(`Ondas altas (${waveHeight.toFixed(1)} m) pedem atenção na orla`);
    }
  }

  if (wind >= 25) {
    reasons.push(`Vento forte (${Math.round(wind)} km/h) pode levantar areia na orla`);
  } else if (wind >= 6 && wind <= 18) {
    reasons.push(`Vento leve (${Math.round(wind)} km/h) ajuda a refrescar`);
  } else if (wind >= 19) {
    reasons.push(`Vento moderado a forte (${Math.round(wind)} km/h) na orla`);
  }

  if (uv >= 8 && reasons.length < 3) {
    reasons.push('Radiação UV alta — reforce o protetor solar');
  }

  let summaryReason: string;
  if (status === 'praiou') {
    summaryReason =
      clouds <= 35
        ? 'Céu mais limpo, calor agradável e mar tranquilo na estimativa'
        : 'Clima agradável e mar moderado na estimativa';
  } else if (status === 'talvez') {
    if (waveHeight !== null && waveHeight >= 2.0) {
      summaryReason = 'Ondas altas pedem atenção na orla';
    } else if (rainProb >= 55 || rainMm >= 1.0) {
      summaryReason = 'Chuva provável reduz a estimativa — vale acompanhar';
    } else if (wind >= 25) {
      summaryReason = 'Vento forte reduz o conforto na areia';
    } else if (clouds >= 75) {
      summaryReason = 'Mar tranquilo, mas céu bem encoberto reduz a estimativa';
    } else {
      summaryReason = 'Condições mistas na estimativa — acompanhe a previsão';
    }
  } else {
    if (rainMm >= 3.0) {
      summaryReason = 'Chuva forte prevista — melhor deixar para outro momento';
    } else if (waveHeight !== null && waveHeight >= 2.0) {
      summaryReason = 'Ondas altas pedem atenção na orla';
    } else {
      summaryReason = 'Chuva ou clima fechado reduzem bastante a estimativa';
    }
  }

  return {
    score,
    status,
    summaryReason,
    reasons: reasons.slice(0, 3),
    components,
    activeWeight,
    appliedCap,
  };
}
