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

export interface PraiouScoreResult {
  score: number;
  status: PraiouStatus;
  summaryReason: string;
  reasons: string[];
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export function calculatePraiouScore(input: PraiouScoreInput): PraiouScoreResult {
  const reasons: string[] = [];

  const rainMm = input.rainMm ?? 0;
  const rainProb = input.rainProb ?? 0;
  const wind = input.windKmh ?? 12;
  const temp = input.temperatureC ?? 26;
  const clouds = input.cloudCover ?? 30;
  const uv = input.uvIndex ?? 5;
  const waveHeight = input.waveHeightM;
  const wavePeriod = input.wavePeriodS;

  // 1. Chuva (peso 0.30)
  const rainScore = clamp(100 - rainProb * 0.7 - rainMm * 25);
  if (rainMm >= 3.0) {
    reasons.push('Chuva forte acontecendo ou prevista para agora');
  } else if (rainProb >= 65 || rainMm >= 1.0) {
    reasons.push('Chance alta de chuva nas próximas horas');
  } else if (rainProb <= 20 && rainMm < 0.2) {
    reasons.push('Sem previsão de chuva para aproveitar a areia');
  }

  // 2. Vento (peso 0.20)
  const windScore = clamp(100 - Math.max(0, wind - 10) * 3.4);
  if (wind >= 25) {
    reasons.push(`Vento forte (${Math.round(wind)} km/h) pode levantar areia`);
  } else if (wind >= 18) {
    reasons.push(`Vento moderado (${Math.round(wind)} km/h) na orla`);
  } else {
    reasons.push(`Vento leve (${Math.round(wind)} km/h) sem atrapalhar a canga`);
  }

  // 3. Ondas e período (peso 0.22)
  let waveScore = 75;
  if (waveHeight !== null) {
    if (waveHeight <= 1.0) {
      waveScore = 95;
      reasons.push(`Ondas baixas (${waveHeight.toFixed(1)} m), boas para entrar na água`);
    } else if (waveHeight < 2.0) {
      waveScore = clamp(95 - (waveHeight - 1.0) * 48);
      reasons.push(`Ondas médias (${waveHeight.toFixed(1)} m) pedem atenção na beira`);
    } else {
      waveScore = clamp(45 - (waveHeight - 2.0) * 20);
      reasons.unshift(`Mar agitado (${waveHeight.toFixed(1)} m) com ondas fortes`);
    }

    if (wavePeriod !== null && wavePeriod >= 12 && waveHeight >= 1.4) {
      waveScore = clamp(waveScore - 10);
    }
  }

  // 4. Temperatura e nuvens (peso 0.20)
  let tempPenalty = 0;
  if (temp < 23) tempPenalty = (23 - temp) * 9;
  else if (temp > 36) tempPenalty = (temp - 36) * 7;

  const skyAndTempScore = clamp(100 - clouds * 0.45 - tempPenalty);
  if (clouds <= 35 && temp >= 25) {
    reasons.push(`Sol aparecendo bem e temperatura agradável (${Math.round(temp)}°C)`);
  } else if (clouds >= 80) {
    reasons.push('Céu bem encoberto com pouca abertura de sol');
  } else if (temp < 22) {
    reasons.push(`Temperatura mais fresca (${Math.round(temp)}°C) para banho de mar`);
  }

  // 5. Índice UV (peso 0.08) — UV muito alto pede cuidado extra com proteção
  const uvScore = uv >= 10 ? 68 : uv >= 8 ? 82 : 95;
  if (uv >= 9 && reasons.length < 3) {
    reasons.push('Radiação UV alta — reforce o protetor solar');
  }

  let rawScore =
    rainScore * 0.3 +
    windScore * 0.2 +
    waveScore * 0.22 +
    skyAndTempScore * 0.2 +
    uvScore * 0.08;

  // Limites obrigatórios por condições adversas
  if (waveHeight !== null && waveHeight >= 2.0) {
    rawScore = Math.min(rawScore, 45);
  }
  if (rainMm >= 3.0) {
    rawScore = Math.min(rawScore, 40);
  }

  const score = Math.round(clamp(rawScore));
  const status: PraiouStatus =
    score >= 70 ? 'praiou' : score >= 45 ? 'talvez' : 'nao_praiou';

  let summaryReason: string;
  if (status === 'praiou') {
    summaryReason =
      clouds <= 35 ? 'Bom para banho e pegar sol' : 'Clima agradável e mar tranquilo';
  } else if (status === 'talvez') {
    if (waveHeight !== null && waveHeight >= 2.0) {
      summaryReason = 'Mar agitado — evite entrar na água';
    } else if (wind >= 20) {
      summaryReason = 'Vento pode incomodar, mas vale checar';
    } else if (rainProb >= 40) {
      summaryReason = 'Tempo instável — vale checar antes de sair';
    } else {
      summaryReason = 'Condições razoáveis, com atenção ao mar';
    }
  } else {
    if (rainMm >= 2.0 && (waveHeight ?? 0) >= 1.8) {
      summaryReason = 'Chuva e mar agitado — melhor evitar';
    } else if (rainMm >= 2.0) {
      summaryReason = 'Chuva forte — melhor deixar para outro dia';
    } else if (waveHeight !== null && waveHeight >= 2.0) {
      summaryReason = 'Mar muito agitado — melhor evitar';
    } else {
      summaryReason = 'Clima fechado ou mar mexido — melhor adiar';
    }
  }

  return {
    score,
    status,
    summaryReason,
    reasons: reasons.slice(0, 3),
  };
}
