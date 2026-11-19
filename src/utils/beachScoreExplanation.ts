import type { BeachSnapshot } from '../types';
import {
  evaluatePraiouScoreComponents,
  PRAIOU_SCORE_WEIGHTS,
  type ScoreFactorKey,
} from './praiouScore';

export type FactorRating = 'bom' | 'regular' | 'atencao' | 'indisponivel';

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
  uvNotice: string | null;
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

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function capitalizeFirst(text: string): string {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatSkyAndSunValue(
  cloudCover: number | null,
  uvIndex: number | null,
  isNight: boolean
): string {
  const parts: string[] = [];
  if (cloudCover !== null) {
    parts.push(`${cloudCover}% de nuvens`);
  }
  if (uvIndex !== null && (!isNight || uvIndex > 0)) {
    parts.push(`UV ${uvIndex}`);
  } else if (uvIndex !== null && isNight) {
    parts.push(`UV ${uvIndex} (noturno)`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Sem leitura';
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

function getPositiveSnippet(
  factorKey: ScoreFactorKey,
  snapshot: BeachSnapshot,
  isNight: boolean
): string {
  switch (factorKey) {
    case 'skyAndSun':
      if (isNight) {
        return snapshot.cloudCover !== null && snapshot.cloudCover <= 25
          ? 'noite de céu aberto'
          : 'noite pouco nublada';
      }
      if (snapshot.cloudCover !== null && snapshot.cloudCover <= 20) {
        return 'céu limpo';
      }
      return 'céu parcialmente limpo';
    case 'temperature':
      return snapshot.temperatureC !== null
        ? `calor agradável (${Math.round(snapshot.temperatureC)}°C)`
        : 'temperatura agradável';
    case 'wave':
      if (snapshot.waveHeightM !== null) {
        return snapshot.waveHeightM <= 1.0
          ? `mar tranquilo (${snapshot.waveHeightM.toFixed(1)} m)`
          : `mar com ondas moderadas (${snapshot.waveHeightM.toFixed(1)} m)`;
      }
      return 'mar tranquilo';
    case 'wind':
      return snapshot.windKmh !== null
        ? `vento leve (${Math.round(snapshot.windKmh)} km/h)`
        : 'vento leve';
    case 'rain':
      return snapshot.rainProb !== null
        ? `baixa chance de chuva (${snapshot.rainProb}%)`
        : 'baixa chance de chuva';
  }
}

function getLimitingSnippet(
  factorKey: ScoreFactorKey,
  snapshot: BeachSnapshot,
  isNight: boolean
): string {
  switch (factorKey) {
    case 'skyAndSun': {
      const clouds = snapshot.cloudCover;
      if (clouds !== null) {
        if (isNight) {
          return clouds >= 70
            ? `céu bem encoberto (${clouds}% de nuvens)`
            : `nuvens mais presentes (${clouds}%)`;
        }
        return clouds >= 70
          ? `céu bem encoberto (${clouds}% de nuvens)`
          : `nuvens parciais (${clouds}%)`;
      }
      return !isNight && snapshot.uvIndex !== null && snapshot.uvIndex >= 10
        ? `UV muito alto (UV ${snapshot.uvIndex})`
        : 'cobertura de nuvens mais alta';
    }
    case 'temperature':
      if (snapshot.temperatureC !== null && snapshot.temperatureC < 23) {
        return `temperatura mais fresca (${Math.round(snapshot.temperatureC)}°C)`;
      }
      if (snapshot.temperatureC !== null && snapshot.temperatureC > 36) {
        return `calor excessivo (${Math.round(snapshot.temperatureC)}°C)`;
      }
      return 'temperatura fora da faixa mais agradável';
    case 'wave':
      if (
        snapshot.waveHeightM !== null &&
        snapshot.wavePeriodS !== null &&
        snapshot.wavePeriodS >= 12 &&
        snapshot.waveHeightM >= 1.2
      ) {
        return `ondas (${snapshot.waveHeightM.toFixed(1)} m) com período longo (${Math.round(snapshot.wavePeriodS)} s)`;
      }
      return snapshot.waveHeightM !== null
        ? `ondas ${snapshot.waveHeightM >= 1.5 ? 'mais altas' : 'moderadas'} (${snapshot.waveHeightM.toFixed(1)} m)`
        : 'ondas mais agitadas';
    case 'wind':
      if (snapshot.windKmh !== null && snapshot.windKmh < 6) {
        return `vento muito fraco (${Math.round(snapshot.windKmh)} km/h) no calor`;
      }
      return snapshot.windKmh !== null
        ? `vento forte (${Math.round(snapshot.windKmh)} km/h)`
        : 'vento mais forte';
    case 'rain':
      if (snapshot.rainMm !== null && snapshot.rainMm >= 1.0) {
        return `chuva prevista (${snapshot.rainMm.toFixed(1)} mm/h)`;
      }
      return snapshot.rainProb !== null
        ? `chuva provável (${snapshot.rainProb}%)`
        : 'chuva provável';
  }
}

export function buildBeachScoreExplanation(
  snapshot: BeachSnapshot,
  isNight: boolean
): BeachScoreExplanation {
  const { components, activeWeight } = evaluatePraiouScoreComponents({
    temperatureC: snapshot.temperatureC,
    rainProb: snapshot.rainProb,
    rainMm: snapshot.rainMm,
    windKmh: snapshot.windKmh,
    cloudCover: snapshot.cloudCover,
    uvIndex: snapshot.uvIndex,
    waveHeightM: snapshot.waveHeightM,
    wavePeriodS: snapshot.wavePeriodS,
  });

  // 1. Céu e sol (30%) / Céu e nuvens à noite
  const skySub = components.skyAndSun.subScore;
  let skyRating: FactorRating = 'indisponivel';
  let skyEffect = 'Sem leitura de nuvens e UV nesta atualização.';
  if (skySub !== null) {
    if (skySub >= 75) {
      skyRating = 'bom';
      skyEffect = isNight
        ? 'Céu mais limpo na noite atual contribui positivamente para este fator.'
        : snapshot.uvIndex !== null && snapshot.uvIndex >= 8
          ? 'Poucas nuvens favorecem a abertura de céu; UV alto pede proteção solar reforçada.'
          : 'Poucas nuvens garantem boa abertura de céu na estimativa.';
    } else if (skySub >= 50) {
      skyRating = 'regular';
      skyEffect = isNight
        ? 'Nebulosidade moderada reduz parcialmente a pontuação do céu noturno.'
        : 'Nuvens parciais reduzem a abertura de sol e descontam pontos deste fator (peso de 30%).';
    } else {
      skyRating = 'atencao';
      skyEffect = isNight
        ? 'Céu bem encoberto reduz de forma perceptível este fator.'
        : 'Céu bem encoberto reduz bastante a abertura de sol e puxa o índice para baixo.';
    }
  }

  // 2. Temperatura (20%)
  const tempSub = components.temperature.subScore;
  let tempRating: FactorRating = 'indisponivel';
  let tempEffect = 'Sem leitura de temperatura nesta atualização.';
  if (tempSub !== null && snapshot.temperatureC !== null) {
    const t = snapshot.temperatureC;
    if (t < 23) {
      tempRating = tempSub >= 65 ? 'regular' : 'atencao';
      tempEffect =
        'Temperatura abaixo de 23°C reduz a pontuação por deixar o clima mais fresco na areia.';
    } else if (t > 36) {
      tempRating = tempSub >= 65 ? 'regular' : 'atencao';
      tempEffect =
        'Calor excessivo acima de 36°C reduz a pontuação pelo desconforto térmico na estimativa.';
    } else if (t > 33) {
      tempRating = 'bom';
      tempEffect =
        'Calor intenso (34°C–36°C) pontua bem, mas sem nota máxima para não premiar calor extremo.';
    } else {
      tempRating = 'bom';
      tempEffect =
        'Temperatura agradável a quente (23°C–33°C) favorece a permanência na orla.';
    }
  }

  // 3. Mar para nadar (20%)
  const waveSub = components.wave.subScore;
  let waveRating: FactorRating = 'indisponivel';
  let waveEffect =
    'Leitura de ondas indisponível; o índice considerou apenas os demais fatores.';
  if (waveSub !== null && snapshot.waveHeightM !== null) {
    const h = snapshot.waveHeightM;
    const p = snapshot.wavePeriodS;
    const hasPeriodPenalty = p !== null && p >= 12 && h >= 1.2;

    if (h >= 2.0) {
      waveRating = 'atencao';
      waveEffect =
        'Ondas a partir de 2,0 m reduzem bastante a pontuação, limitam o índice a no máximo 45/100 e pedem atenção na orla.';
    } else if (waveSub < 60) {
      waveRating = 'atencao';
      waveEffect = hasPeriodPenalty
        ? 'Ondas mais altas com período longo (≥ 12 s) têm mais energia e pedem atenção na orla.'
        : 'Ondas mais elevadas reduzem a pontuação e pedem atenção na beira da água.';
    } else if (h <= 1.0 && !hasPeriodPenalty) {
      waveRating = 'bom';
      waveEffect =
        'Ondas previstas baixas (até 1,0 m) pontuam bem na estimativa; sempre confira correntes e bandeiras no local.';
    } else {
      waveRating = 'regular';
      waveEffect = hasPeriodPenalty
        ? 'Ondas médias com período longo (≥ 12 s) descontam pontos adicionais na estimativa.'
        : 'Ondas moderadas tiram alguns pontos em relação a um mar mais calmo.';
    }
  }

  // 4. Vento (15%)
  const windSub = components.wind.subScore;
  let windRating: FactorRating = 'indisponivel';
  let windEffect = 'Sem leitura de vento nesta atualização.';
  if (windSub !== null && snapshot.windKmh !== null) {
    const w = snapshot.windKmh;
    if (w < 6) {
      windRating = windSub >= 85 ? 'bom' : 'regular';
      windEffect =
        snapshot.temperatureC !== null && snapshot.temperatureC >= 30
          ? 'Vento muito fraco no calor refresca pouco na areia, ficando em nível neutro na estimativa.'
          : 'Vento muito fraco mantém condição neutra a levemente positiva na estimativa.';
    } else if (w <= 18) {
      windRating = 'bom';
      windEffect =
        'Vento médio leve a moderado ajuda a refrescar sem incomodar na areia.';
    } else if (w < 25) {
      windRating = 'regular';
      windEffect =
        'Vento médio moderado-forte começa a incomodar na areia e reduz este fator.';
    } else {
      windRating = 'atencao';
      windEffect =
        'Vento médio forte reduz bastante este fator e pode levantar areia na orla.';
    }
  }

  // 5. Chuva (15%)
  const rainSub = components.rain.subScore;
  let rainRating: FactorRating = 'indisponivel';
  let rainEffect = 'Sem leitura de chuva nesta atualização.';
  if (rainSub !== null) {
    if (snapshot.rainMm !== null && snapshot.rainMm >= 3.0) {
      rainRating = 'atencao';
      rainEffect =
        'Volume de chuva ≥ 3,0 mm/h reduz este fator e limita o índice geral a no máximo 40/100.';
    } else if (rainSub < 55) {
      rainRating = 'atencao';
      rainEffect =
        'Chance ou volume elevado de chuva reduz de forma relevante a pontuação da estimativa.';
    } else if (rainSub >= 82) {
      rainRating = 'bom';
      rainEffect =
        'Baixa chance e baixo volume de chuva favorecem a estimativa.';
    } else {
      rainRating = 'regular';
      rainEffect =
        'Chance moderada de chuva reduz parte deste fator sem punir em dobro o mesmo evento.';
    }
  }

  const rawItems: Array<{
    key: ScoreFactorKey;
    label: string;
    predictedValueLabel: string;
    rating: FactorRating;
    effectDescription: string;
  }> = [
    {
      key: 'skyAndSun',
      label: isNight ? 'Céu e nuvens' : 'Céu e sol',
      predictedValueLabel: formatSkyAndSunValue(
        snapshot.cloudCover,
        snapshot.uvIndex,
        isNight
      ),
      rating: skyRating,
      effectDescription: skyEffect,
    },
    {
      key: 'temperature',
      label: 'Temperatura',
      predictedValueLabel:
        snapshot.temperatureC !== null ? `${snapshot.temperatureC}°C` : 'Sem leitura',
      rating: tempRating,
      effectDescription: tempEffect,
    },
    {
      key: 'wave',
      label: 'Mar para nadar',
      predictedValueLabel: formatWaveValue(
        snapshot.waveHeightM,
        snapshot.wavePeriodS
      ),
      rating: waveRating,
      effectDescription: waveEffect,
    },
    {
      key: 'wind',
      label: 'Vento',
      predictedValueLabel:
        snapshot.windKmh !== null ? `${snapshot.windKmh} km/h` : 'Sem leitura',
      rating: windRating,
      effectDescription: windEffect,
    },
    {
      key: 'rain',
      label: 'Chuva',
      predictedValueLabel: formatRainValue(snapshot.rainProb, snapshot.rainMm),
      rating: rainRating,
      effectDescription: rainEffect,
    },
  ];

  const hasRedistributedWeights = activeWeight > 0 && activeWeight < 0.999;

  const factors: ScoreFactorBreakdown[] = rawItems.map((item) => {
    const nominalWeight = PRAIOU_SCORE_WEIGHTS[item.key];
    const subScore = components[item.key].subScore;
    const effectiveWeight =
      subScore !== null && activeWeight > 0 ? nominalWeight / activeWeight : 0;
    const maxPointsApprox = roundOneDecimal(effectiveWeight * 100);
    const contributedPointsApprox =
      subScore !== null ? roundOneDecimal(subScore * effectiveWeight) : null;
    const pointsLostApprox =
      subScore !== null ? roundOneDecimal((100 - subScore) * effectiveWeight) : 0;

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
      subScore: subScore !== null ? roundOneDecimal(subScore) : null,
      effectDescription: item.effectDescription,
    };
  });

  // Limites obrigatórios de segurança
  let capNotice: string | null = null;
  if (snapshot.rainMm !== null && snapshot.rainMm >= 3.0) {
    capNotice =
      'Limite de segurança aplicado: chuva prevista ≥ 3,0 mm/h limita o índice a no máximo 40.0/100.';
  } else if (snapshot.waveHeightM !== null && snapshot.waveHeightM >= 2.0) {
    capNotice =
      'Limite de segurança aplicado: ondas previstas ≥ 2,0 m limitam o índice a no máximo 45.0/100.';
  }

  // Aviso de proteção solar preservado (somente durante o dia quando UV >= 8)
  const uvNotice =
    !isNight && snapshot.uvIndex !== null && snapshot.uvIndex >= 8
      ? `Índice UV ${snapshot.uvIndex} (${snapshot.uvIndex >= 10 ? 'muito alto' : 'alto'}) — reforce o protetor solar.`
      : null;

  // Construção da frase curta no cartão com base exata nos fatores reais
  let shortSummary: string;
  const hasWaveData = snapshot.waveHeightM !== null;

  if (snapshot.rainMm !== null && snapshot.rainMm >= 3.0) {
    shortSummary = `Chuva forte prevista (${snapshot.rainMm.toFixed(1)} mm/h) limita o índice e pede cautela.`;
  } else if (snapshot.waveHeightM !== null && snapshot.waveHeightM >= 2.0) {
    shortSummary = `Ondas altas (${snapshot.waveHeightM.toFixed(1)} m) pedem atenção na orla e limitam o índice.`;
  } else {
    const activeFactors = factors.filter((f) => f.subScore !== null);
    const byMostPenalized = [...activeFactors].sort(
      (a, b) => b.pointsLostApprox - a.pointsLostApprox
    );
    const byBest = [...activeFactors].sort((a, b) => {
      const scoreDiff = (b.subScore ?? 0) - (a.subScore ?? 0);
      if (Math.abs(scoreDiff) > 5) return scoreDiff;
      const priority: Record<ScoreFactorKey, number> = {
        skyAndSun: 0,
        temperature: 1,
        wave: 2,
        wind: 3,
        rain: 4,
      };
      return priority[a.key] - priority[b.key];
    });

    const worst = byMostPenalized[0];
    const secondWorst = byMostPenalized[1];
    const strongPositives = byBest.filter((f) => (f.subScore ?? 0) >= 82);

    if (worst && (worst.pointsLostApprox >= 3.0 || (worst.subScore ?? 100) < 76)) {
      const positivesForContrast = strongPositives
        .filter((f) => f.key !== worst.key)
        .slice(0, 2);

      if (
        secondWorst &&
        secondWorst.key !== worst.key &&
        secondWorst.pointsLostApprox >= 4.0 &&
        (worst.subScore ?? 100) < 65
      ) {
        shortSummary = `${capitalizeFirst(
          getLimitingSnippet(worst.key, snapshot, isNight)
        )} e ${getLimitingSnippet(secondWorst.key, snapshot, isNight)} reduzem a estimativa.`;
      } else if (positivesForContrast.length === 2) {
        shortSummary = `${capitalizeFirst(
          getPositiveSnippet(positivesForContrast[0].key, snapshot, isNight)
        )} e ${getPositiveSnippet(
          positivesForContrast[1].key,
          snapshot,
          isNight
        )}, mas ${getLimitingSnippet(worst.key, snapshot, isNight)} reduz a estimativa.`;
      } else if (positivesForContrast.length === 1) {
        shortSummary = `${capitalizeFirst(
          getPositiveSnippet(positivesForContrast[0].key, snapshot, isNight)
        )}, mas ${getLimitingSnippet(worst.key, snapshot, isNight)} reduz a estimativa.`;
      } else {
        shortSummary = `${capitalizeFirst(
          getLimitingSnippet(worst.key, snapshot, isNight)
        )} reduz a estimativa atual.`;
      }
    } else if (strongPositives.length >= 3) {
      const skyOrFirst = strongPositives[0];
      const second = strongPositives[1];
      const third = strongPositives[2];
      const windFactor = strongPositives.find(
        (f) =>
          f.key === 'wind' &&
          f.key !== skyOrFirst.key &&
          f.key !== second.key &&
          f.key !== third.key
      );

      shortSummary = `${capitalizeFirst(
        getPositiveSnippet(skyOrFirst.key, snapshot, isNight)
      )}, ${getPositiveSnippet(second.key, snapshot, isNight)} e ${getPositiveSnippet(
        third.key,
        snapshot,
        isNight
      )}.${
        windFactor && snapshot.windKmh !== null && snapshot.windKmh >= 6 && snapshot.windKmh <= 18
          ? ' Vento leve ajuda a refrescar.'
          : ''
      }`;
    } else if (strongPositives.length === 2) {
      shortSummary = `${capitalizeFirst(
        getPositiveSnippet(strongPositives[0].key, snapshot, isNight)
      )} e ${getPositiveSnippet(
        strongPositives[1].key,
        snapshot,
        isNight
      )} na estimativa atual.`;
    } else {
      shortSummary = 'Condições moderadas na estimativa atual.';
    }

    if (!hasWaveData) {
      shortSummary = `${shortSummary.replace(/\.$/, '')} (sem leitura de ondas).`;
    }
  }

  const hasWeatherSource =
    snapshot.temperatureC !== null ||
    snapshot.rainProb !== null ||
    snapshot.rainMm !== null ||
    snapshot.windKmh !== null ||
    snapshot.cloudCover !== null ||
    snapshot.uvIndex !== null;

  return {
    shortSummary,
    factors,
    capNotice,
    uvNotice,
    hasRedistributedWeights,
    weatherSourceLabel: hasWeatherSource
      ? 'Open-Meteo (Previsão Meteorológica)'
      : 'Indisponível nesta leitura',
    marineSourceLabel: hasWaveData
      ? 'Open-Meteo (Previsão Marinha)'
      : 'Indisponível nesta leitura',
  };
}
