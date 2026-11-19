import type { BeachSnapshot } from '../types';

export type FactorRating = 'bom' | 'regular' | 'atencao' | 'indisponivel';

export type ScoreFactorKey =
  | 'rain'
  | 'wave'
  | 'wind'
  | 'skyAndTemp'
  | 'uv';

export interface ScoreFactorBreakdown {
  key: ScoreFactorKey;
  label: string;
  predictedValueLabel: string;
  rating: FactorRating;
  ratingLabel: string;
  nominalWeightPercent: number;
  effectiveWeightPercent: number;
  maxPointsApprox: number;
  contributedPointsApprox: number | null;
  pointsLostApprox: number;
  subScore: number | null;
  effectDescription: string;
}

export interface BeachScoreExplanation {
  shortSummary: string;
  factors: ScoreFactorBreakdown[];
  capNotice: string | null;
  hasRedistributedWeights: boolean;
  weatherSourceLabel: string;
  marineSourceLabel: string;
}

const RATING_LABELS: Record<FactorRating, string> = {
  bom: 'Bom',
  regular: 'Regular',
  atencao: 'Atenção',
  indisponivel: 'Sem leitura',
};

const WEIGHTS: Record<ScoreFactorKey, number> = {
  rain: 0.3,
  wave: 0.22,
  wind: 0.2,
  skyAndTemp: 0.2,
  uv: 0.08,
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatRainValue(rainProb: number | null, rainMm: number | null): string {
  if (rainProb !== null && rainMm !== null) {
    return `${rainProb}% de chance · ${rainMm.toFixed(1)} mm/h`;
  }
  if (rainProb !== null) {
    return `${rainProb}% de chance`;
  }
  if (rainMm !== null) {
    return `${rainMm.toFixed(1)} mm/h`;
  }
  return 'Sem leitura';
}

function formatWaveValue(
  waveHeightM: number | null,
  wavePeriodS: number | null
): string {
  if (waveHeightM === null) {
    return 'Sem leitura';
  }
  if (wavePeriodS !== null) {
    return `${waveHeightM.toFixed(1)} m · período ${wavePeriodS} s`;
  }
  return `${waveHeightM.toFixed(1)} m`;
}

function formatSkyAndTempValue(
  temperatureC: number | null,
  cloudCover: number | null
): string {
  if (temperatureC !== null && cloudCover !== null) {
    return `${temperatureC}°C · ${cloudCover}% de nuvens`;
  }
  if (temperatureC !== null) {
    return `${temperatureC}°C`;
  }
  if (cloudCover !== null) {
    return `${cloudCover}% de nuvens`;
  }
  return 'Sem leitura';
}

function getPositiveSnippet(
  factor: ScoreFactorBreakdown,
  snapshot: BeachSnapshot,
  isNight: boolean
): string {
  switch (factor.key) {
    case 'rain':
      return snapshot.rainProb !== null
        ? `chuva baixa (${snapshot.rainProb}%)`
        : 'chuva baixa';
    case 'wind':
      return snapshot.windKmh !== null
        ? `vento leve (${Math.round(snapshot.windKmh)} km/h)`
        : 'vento leve';
    case 'wave':
      return snapshot.waveHeightM !== null
        ? `ondas baixas (${snapshot.waveHeightM.toFixed(1)} m)`
        : 'mar mais calmo';
    case 'skyAndTemp':
      if (isNight) {
        return 'noite estável';
      }
      return snapshot.cloudCover !== null && snapshot.cloudCover <= 35
        ? 'boa abertura de sol'
        : 'temperatura confortável';
    case 'uv':
      return isNight ? 'UV baixo à noite' : 'UV moderado';
  }
}

function getLimitingSnippet(
  factor: ScoreFactorBreakdown,
  snapshot: BeachSnapshot,
  isNight: boolean
): string {
  switch (factor.key) {
    case 'rain':
      if (snapshot.rainMm !== null && snapshot.rainMm >= 1.0) {
        return `chuva prevista (${snapshot.rainMm.toFixed(1)} mm/h)`;
      }
      return snapshot.rainProb !== null
        ? `chance maior de chuva (${snapshot.rainProb}%)`
        : 'chance maior de chuva';
    case 'wave':
      if (
        snapshot.waveHeightM !== null &&
        snapshot.wavePeriodS !== null &&
        snapshot.wavePeriodS >= 12 &&
        snapshot.waveHeightM >= 1.4
      ) {
        return `ondas (${snapshot.waveHeightM.toFixed(1)} m) com período longo (${Math.round(snapshot.wavePeriodS)} s)`;
      }
      return snapshot.waveHeightM !== null
        ? `ondas ${snapshot.waveHeightM >= 1.5 ? 'mais altas' : 'moderadas'} (${snapshot.waveHeightM.toFixed(1)} m)`
        : 'ondas mais agitadas';
    case 'wind':
      return snapshot.windKmh !== null
        ? `vento de ${Math.round(snapshot.windKmh)} km/h`
        : 'vento mais forte';
    case 'skyAndTemp': {
      const temp = snapshot.temperatureC;
      const clouds = snapshot.cloudCover;
      const tempPenalty =
        temp !== null
          ? temp < 23
            ? (23 - temp) * 9
            : temp > 36
              ? (temp - 36) * 7
              : 0
          : 0;
      const cloudPenalty = clouds !== null ? clouds * 0.45 : 0;

      if (temp !== null && tempPenalty > cloudPenalty) {
        if (temp < 23) {
          return `temperatura mais fresca (${Math.round(temp)}°C)`;
        }
        return `calor intenso (${Math.round(temp)}°C)`;
      }
      if (clouds !== null) {
        if (isNight) {
          return `céu mais encoberto (${clouds}% de nuvens)`;
        }
        return clouds >= 70
          ? `céu bem encoberto (${clouds}% de nuvens)`
          : `nuvens parciais (${clouds}%)`;
      }
      return 'nebulosidade ou temperatura fora da faixa ideal';
    }
    case 'uv':
      return snapshot.uvIndex !== null
        ? `radiação UV alta (UV ${snapshot.uvIndex})`
        : 'radiação UV alta';
  }
}

function capitalizeFirst(text: string): string {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function buildBeachScoreExplanation(
  snapshot: BeachSnapshot,
  isNight: boolean
): BeachScoreExplanation {
  // 1. Chuva (30%)
  const hasRainData = snapshot.rainProb !== null || snapshot.rainMm !== null;
  const rainProb = snapshot.rainProb ?? 0;
  const rainMm = snapshot.rainMm ?? 0;
  const rainSubScore = hasRainData
    ? clamp(100 - rainProb * 0.7 - rainMm * 25)
    : null;
  let rainRating: FactorRating = 'indisponivel';
  let rainEffect = 'Sem leitura de chuva nesta atualização.';
  if (hasRainData && rainSubScore !== null) {
    if (snapshot.rainMm !== null && snapshot.rainMm >= 3.0) {
      rainRating = 'atencao';
      rainEffect =
        'Chuva forte prevista derruba este fator e limita o índice geral a no máximo 40/100.';
    } else if (rainSubScore < 45) {
      rainRating = 'atencao';
      rainEffect =
        'Probabilidade ou volume de chuva elevado reduz fortemente este fator (peso de 30%).';
    } else if (rainProb <= 20 && rainMm < 0.2) {
      rainRating = 'bom';
      rainEffect =
        'Baixa chance e baixo volume de chuva favorecem a estimativa na orla.';
    } else {
      rainRating = 'regular';
      rainEffect =
        'Possibilidade moderada de chuva reduz parte dos pontos deste fator.';
    }
  }

  // 2. Mar e ondas (22%)
  const hasWaveData = snapshot.waveHeightM !== null;
  let waveSubScore: number | null = null;
  let waveRating: FactorRating = 'indisponivel';
  let waveEffect =
    'Leitura de ondas indisponível; o índice considerou apenas os demais fatores.';

  if (snapshot.waveHeightM !== null) {
    const h = snapshot.waveHeightM;
    const p = snapshot.wavePeriodS;
    if (h <= 1.0) {
      waveSubScore = 95;
    } else if (h < 2.0) {
      waveSubScore = clamp(95 - (h - 1.0) * 48);
    } else {
      waveSubScore = clamp(45 - (h - 2.0) * 20);
    }

    const hasLongPeriodPenalty = p !== null && p >= 12 && h >= 1.4;
    if (hasLongPeriodPenalty) {
      waveSubScore = clamp(waveSubScore - 10);
    }

    if (h >= 2.0) {
      waveRating = 'atencao';
      waveEffect =
        'Ondas a partir de 2,0 m derrubam o fator e limitam o índice geral a no máximo 45/100.';
    } else if (waveSubScore < 50) {
      waveRating = 'atencao';
      waveEffect =
        'Ondas mais altas reduzem o índice e pedem atenção redobrada na beira da água.';
    } else if (h <= 1.0) {
      waveRating = 'bom';
      waveEffect =
        'Ondas previstas até 1,0 m elevam o fator; ainda assim, observe bandeiras e correntes.';
    } else {
      waveRating = 'regular';
      waveEffect = hasLongPeriodPenalty
        ? 'Ondas médias com período longo (≥ 12 s) têm mais força e descontam pontos adicionais.'
        : 'Ondas médias reduzem parcialmente a pontuação deste fator na estimativa.';
    }
  }

  // 3. Vento (20%)
  const hasWindData = snapshot.windKmh !== null;
  const windSubScore =
    snapshot.windKmh !== null
      ? clamp(100 - Math.max(0, snapshot.windKmh - 10) * 3.4)
      : null;
  let windRating: FactorRating = 'indisponivel';
  let windEffect = 'Sem leitura de vento nesta atualização.';
  if (hasWindData && windSubScore !== null) {
    if (windSubScore >= 75) {
      windRating = 'bom';
      windEffect =
        'Vento fraco a leve mantém boa pontuação sem levantar muita areia na estimativa.';
    } else if (windSubScore >= 45) {
      windRating = 'regular';
      windEffect =
        'Vento acima de 10 km/h passa a descontar pontos graduais por desconforto na areia.';
    } else {
      windRating = 'atencao';
      windEffect =
        'Vento mais forte pode levantar areia e dificultar a permanência na orla.';
    }
  }

  // 4. Temperatura e nuvens (20%)
  const hasSkyAndTempData =
    snapshot.temperatureC !== null || snapshot.cloudCover !== null;
  let skyTempSubScore: number | null = null;
  let skyTempRating: FactorRating = 'indisponivel';
  let skyTempEffect = 'Sem leitura de temperatura e nebulosidade nesta atualização.';

  if (hasSkyAndTempData) {
    let tempPenalty = 0;
    if (snapshot.temperatureC !== null) {
      if (snapshot.temperatureC < 23) {
        tempPenalty = (23 - snapshot.temperatureC) * 9;
      } else if (snapshot.temperatureC > 36) {
        tempPenalty = (snapshot.temperatureC - 36) * 7;
      }
    }
    const cloudPenalty =
      snapshot.cloudCover !== null ? snapshot.cloudCover * 0.45 : 0;
    skyTempSubScore = clamp(100 - cloudPenalty - tempPenalty);

    if (skyTempSubScore >= 75) {
      skyTempRating = 'bom';
      skyTempEffect = isNight
        ? 'Céu pouco nublado e temperatura estável mantêm boa pontuação à noite.'
        : 'Poucas nuvens e temperatura entre 23°C e 36°C favorecem este fator.';
    } else if (skyTempSubScore >= 50) {
      skyTempRating = 'regular';
      if (snapshot.temperatureC !== null && snapshot.temperatureC < 23) {
        skyTempEffect =
          'Temperatura abaixo de 23°C reduz este fator por deixar a sensação mais fresca.';
      } else if (snapshot.temperatureC !== null && snapshot.temperatureC > 36) {
        skyTempEffect =
          'Calor acima de 36°C aplica penalidade neste fator pelo desconforto térmico.';
      } else {
        skyTempEffect = isNight
          ? 'Maior cobertura de nuvens reduz parcialmente este fator na estimativa.'
          : 'Nebulosidade mais alta reduz a abertura de sol e desconta pontos mesmo com calor.';
      }
    } else {
      skyTempRating = 'atencao';
      if (snapshot.temperatureC !== null && snapshot.temperatureC < 23) {
        skyTempEffect =
          'Temperatura bem mais fresca (< 23°C) reduz bastante este fator.';
      } else if (snapshot.temperatureC !== null && snapshot.temperatureC > 36) {
        skyTempEffect =
          'Calor extremo (> 36°C) reduz este fator e exige cuidado com hidratação e sol.';
      } else {
        skyTempEffect =
          'Céu muito encoberto reduz de forma perceptível a pontuação deste fator.';
      }
    }
  }

  // 5. Índice UV (8%)
  const hasUvData = snapshot.uvIndex !== null;
  const uvSubScore =
    snapshot.uvIndex !== null
      ? snapshot.uvIndex >= 10
        ? 68
        : snapshot.uvIndex >= 8
          ? 82
          : 95
      : null;
  let uvRating: FactorRating = 'indisponivel';
  let uvEffect = 'Sem leitura de índice UV nesta atualização.';
  if (snapshot.uvIndex !== null) {
    if (snapshot.uvIndex >= 10) {
      uvRating = 'atencao';
      uvEffect =
        'Radiação UV muito alta (≥ 10) reduz este fator e pede proteção solar reforçada.';
    } else if (snapshot.uvIndex >= 8) {
      uvRating = 'regular';
      uvEffect =
        'Radiação UV alta (8–9) reduz levemente este fator na estimativa.';
    } else {
      uvRating = 'bom';
      uvEffect = isNight
        ? 'Índice UV baixo no período noturno mantém a pontuação máxima deste fator.'
        : 'Índice UV abaixo de 8 mantém a pontuação máxima deste fator (use protetor ao sol).';
    }
  }

  const rawItems: Array<{
    key: ScoreFactorKey;
    label: string;
    predictedValueLabel: string;
    rating: FactorRating;
    subScore: number | null;
    effectDescription: string;
  }> = [
    {
      key: 'rain',
      label: 'Chuva',
      predictedValueLabel: formatRainValue(snapshot.rainProb, snapshot.rainMm),
      rating: rainRating,
      subScore: rainSubScore,
      effectDescription: rainEffect,
    },
    {
      key: 'wave',
      label: 'Mar e ondas',
      predictedValueLabel: formatWaveValue(
        snapshot.waveHeightM,
        snapshot.wavePeriodS
      ),
      rating: waveRating,
      subScore: waveSubScore,
      effectDescription: waveEffect,
    },
    {
      key: 'wind',
      label: 'Vento',
      predictedValueLabel:
        snapshot.windKmh !== null ? `${snapshot.windKmh} km/h` : 'Sem leitura',
      rating: windRating,
      subScore: windSubScore,
      effectDescription: windEffect,
    },
    {
      key: 'skyAndTemp',
      label: 'Temperatura e nuvens',
      predictedValueLabel: formatSkyAndTempValue(
        snapshot.temperatureC,
        snapshot.cloudCover
      ),
      rating: skyTempRating,
      subScore: skyTempSubScore,
      effectDescription: skyTempEffect,
    },
    {
      key: 'uv',
      label: 'Índice UV',
      predictedValueLabel:
        snapshot.uvIndex !== null ? `UV ${snapshot.uvIndex}` : 'Sem leitura',
      rating: uvRating,
      subScore: uvSubScore,
      effectDescription: uvEffect,
    },
  ];

  const activeWeightSum = rawItems.reduce(
    (sum, item) => (item.subScore !== null ? sum + WEIGHTS[item.key] : sum),
    0
  );
  const hasRedistributedWeights =
    activeWeightSum > 0 && activeWeightSum < 0.999;

  const factors: ScoreFactorBreakdown[] = rawItems.map((item) => {
    const nominalWeight = WEIGHTS[item.key];
    const effectiveWeight =
      item.subScore !== null && activeWeightSum > 0
        ? nominalWeight / activeWeightSum
        : 0;
    const maxPointsApprox = roundOneDecimal(effectiveWeight * 100);
    const contributedPointsApprox =
      item.subScore !== null
        ? roundOneDecimal(item.subScore * effectiveWeight)
        : null;
    const pointsLostApprox =
      item.subScore !== null
        ? roundOneDecimal((100 - item.subScore) * effectiveWeight)
        : 0;

    return {
      key: item.key,
      label: item.label,
      predictedValueLabel: item.predictedValueLabel,
      rating: item.rating,
      ratingLabel: RATING_LABELS[item.rating],
      nominalWeightPercent: Math.round(nominalWeight * 100),
      effectiveWeightPercent: Math.round(effectiveWeight * 100),
      maxPointsApprox,
      contributedPointsApprox,
      pointsLostApprox,
      subScore: item.subScore !== null ? roundOneDecimal(item.subScore) : null,
      effectDescription: item.effectDescription,
    };
  });

  // Regras obrigatórias de teto do Worker/score
  let capNotice: string | null = null;
  if (snapshot.rainMm !== null && snapshot.rainMm >= 3.0) {
    capNotice =
      'Regra de limite aplicada: chuva prevista ≥ 3,0 mm/h limita o índice a no máximo 40.0/100.';
  } else if (snapshot.waveHeightM !== null && snapshot.waveHeightM >= 2.0) {
    capNotice =
      'Regra de limite aplicada: ondas previstas ≥ 2,0 m limitam o índice a no máximo 45.0/100.';
  }

  // Construção da frase curta baseada nos fatores reais
  let shortSummary: string;
  if (snapshot.rainMm !== null && snapshot.rainMm >= 3.0) {
    shortSummary = `Chuva forte prevista (${snapshot.rainMm.toFixed(1)} mm/h) limita o índice e pede cautela.`;
  } else if (snapshot.waveHeightM !== null && snapshot.waveHeightM >= 2.0) {
    shortSummary = `Ondas altas (${snapshot.waveHeightM.toFixed(1)} m) limitam o índice e pedem atenção na orla.`;
  } else {
    const activeFactors = factors.filter((f) => f.subScore !== null);
    const byMostPenalized = [...activeFactors].sort(
      (a, b) => b.pointsLostApprox - a.pointsLostApprox
    );
    const byBest = [...activeFactors].sort((a, b) => {
      const scoreDiff = (b.subScore ?? 0) - (a.subScore ?? 0);
      if (Math.abs(scoreDiff) > 5) {
        return scoreDiff;
      }
      if (a.key === 'uv' && b.key !== 'uv') return 1;
      if (b.key === 'uv' && a.key !== 'uv') return -1;
      return scoreDiff;
    });

    const worst = byMostPenalized[0];
    const secondWorst = byMostPenalized[1];
    const best = byBest[0];
    const secondBest = byBest.find((f) => f.key !== best?.key);

    if (worst && (worst.pointsLostApprox >= 2.8 || (worst.subScore ?? 100) < 78)) {
      const positivePart =
        best && best.key !== worst.key && (best.subScore ?? 0) >= 80
          ? `${capitalizeFirst(getPositiveSnippet(best, snapshot, isNight))}${
              secondBest &&
              secondBest.key !== worst.key &&
              (secondBest.subScore ?? 0) >= 85
                ? ` e ${getPositiveSnippet(secondBest, snapshot, isNight)}`
                : ''
            }, mas `
          : '';

      const limitingPart = getLimitingSnippet(worst, snapshot, isNight);
      const secondaryLimit =
        secondWorst &&
        secondWorst.key !== worst.key &&
        secondWorst.pointsLostApprox >= 4.0 &&
        !positivePart
          ? ` e ${getLimitingSnippet(secondWorst, snapshot, isNight)}`
          : '';

      const prefix = positivePart
        ? `${positivePart}${limitingPart}${secondaryLimit}`
        : `${capitalizeFirst(limitingPart)}${secondaryLimit}`;

      shortSummary = `${prefix} ${
        secondaryLimit ? 'reduzem' : 'reduz'
      } o índice na estimativa.`;
    } else if (best && secondBest) {
      shortSummary = `${capitalizeFirst(
        getPositiveSnippet(best, snapshot, isNight)
      )} e ${getPositiveSnippet(
        secondBest,
        snapshot,
        isNight
      )} na estimativa atual.`;
    } else if (best) {
      shortSummary = `${capitalizeFirst(
        getPositiveSnippet(best, snapshot, isNight)
      )} na estimativa atual.`;
    } else {
      shortSummary = 'Estimativa calculada com dados limitados no momento.';
    }

    if (!hasWaveData) {
      shortSummary = `${shortSummary.replace(/\.$/, '')} (sem leitura de ondas).`;
    }
  }

  const hasWeatherSource =
    hasRainData || hasWindData || hasSkyAndTempData || hasUvData;
  const weatherSourceLabel = hasWeatherSource
    ? 'Open-Meteo (Previsão Meteorológica)'
    : 'Indisponível nesta leitura';
  const marineSourceLabel = hasWaveData
    ? 'Open-Meteo (Previsão Marinha)'
    : 'Indisponível nesta leitura';

  return {
    shortSummary,
    factors,
    capNotice,
    hasRedistributedWeights,
    weatherSourceLabel,
    marineSourceLabel,
  };
}
