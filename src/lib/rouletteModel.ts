/**
 * Roulette Analysis Core Engine
 */

export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

export const TERMINAL_GROUPS: Record<number, number[]> = {
  0: [0, 10, 20, 30],
  1: [1, 11, 21, 31],
  2: [2, 12, 22, 32],
  3: [3, 13, 23, 33],
  4: [4, 14, 24, 34],
  5: [5, 15, 25, 35],
  6: [6, 16, 26, 36],
  7: [7, 17, 27],
  8: [8, 18, 28],
  9: [9, 19, 29],
};

export const MIRROR_PAIRS: Record<number, number> = {
  26: 10, 10: 26,
  3: 23, 23: 3,
  35: 8, 8: 35,
  12: 30, 30: 12,
  28: 11, 11: 28,
  7: 36, 36: 7,
  29: 13, 13: 29,
  18: 27, 27: 18,
  22: 6, 6: 22,
  9: 34, 34: 9,
  31: 17, 17: 31,
  14: 25, 25: 14,
  20: 2, 2: 20,
  1: 21, 21: 1,
  33: 4, 4: 33,
  16: 19, 19: 16,
  24: 15, 15: 24,
  5: 32, 32: 5
};

export const INVERTED_PAIRS: Record<number, number> = {
  12: 21, 21: 12,
  13: 31, 31: 13,
  23: 32, 32: 23
};

export const TWINS = [11, 22, 33];

// Mapping from PDF 3: Tabela dos Números que se Puxam (@zeroumroleta)
export const PULL_MAPPING: Record<number, number[]> = {
  0: [34, 14, 32, 10],   1: [36, 1, 2, 29],     2: [20, 5, 22, 2],
  3: [35, 4, 33, 6],     4: [12, 22, 2, 24],    5: [18, 6, 24, 2],
  6: [5, 20, 12, 17],    7: [16, 14, 28, 4],    8: [11, 28, 35, 31],
  9: [31, 11, 6, 3],     10: [23, 20, 28, 19],  11: [8, 29, 31, 13],
  12: [21, 32, 36, 3],   13: [31, 11, 33, 15],  14: [34, 14, 30, 5],
  15: [35, 20, 17, 24],  16: [36, 19, 7, 34],   17: [17, 22, 16, 8],
  18: [5, 6, 22, 19],    19: [16, 28, 21, 36],  20: [2, 20, 10, 6],
  21: [21, 12, 19, 16],  22: [2, 17, 32, 18],   23: [32, 23, 7, 14],
  24: [27, 22, 7, 26],   25: [27, 22, 2, 26],   26: [29, 0, 23, 34],
  27: [24, 25, 13, 26],  28: [8, 12, 19, 24],   29: [26, 11, 1, 18],
  30: [14, 30, 36, 16],  31: [13, 22, 11, 28],  32: [23, 12, 22, 15],
  33: [36, 31, 3, 1],    34: [0, 14, 34, 36],   35: [15, 12, 8, 9],
  36: [16, 36, 1, 12]
};

// 5 Parts division of the wheel
export const WHEEL_REGIONS = [
  WHEEL_ORDER.slice(0, 7),   // Part 1
  WHEEL_ORDER.slice(7, 14),  // Part 2
  WHEEL_ORDER.slice(14, 21), // Part 3
  WHEEL_ORDER.slice(21, 28), // Part 4
  WHEEL_ORDER.slice(28, 37), // Part 5
];

export interface PatternAnalysis {
  probabilities: Record<number, number>; 
  reasoning: string[];
  suggestedTerminal: number | null;
  regionsActivity: number[];
  triggeredStrategy?: string;
}

export interface EmpiricalBias {
  strategySuccess: Record<string, number>; // strategyName -> successRate (0-1)
  terminalSuccess: Record<number, number>; // terminal -> successRate (0-1)
}

export const analyzePatterns = (history: number[], bias?: EmpiricalBias): PatternAnalysis => {
  if (history.length < 3) return { probabilities: {}, reasoning: [], suggestedTerminal: null, regionsActivity: [0,0,0,0,0] };

  const probs: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
  const reasoning: string[] = [];
  const regionsActivity = [0, 0, 0, 0, 0];
  let triggeredStrategy = "";

  const lastNum = history[0];
  const lastTerminal = lastNum % 10;

  // --- ABSENCE ANALYSIS (Convergência de Vácuo) ---
  const terminalAppeared = new Array(10).fill(false);
  const regionAppeared = new Array(5).fill(false);
  
  // Look back at historical data to find what's missing
  history.slice(0, 15).forEach(num => {
    terminalAppeared[num % 10] = true;
    WHEEL_REGIONS.forEach((region, idx) => {
      if (region.includes(num)) regionAppeared[idx] = true;
    });
  });

  // Apply "Vacuum" weights to absent terminals
  terminalAppeared.forEach((appeared, term) => {
    if (!appeared && history.length >= 10) {
      probs[term] += 25;
      reasoning.push(`Convergência de Vácuo: Terminal ${term} ausente no ciclo recente.`);
    }
  });

  // Apply weights to terminals in absent regions
  regionAppeared.forEach((appeared, idx) => {
    if (!appeared && history.length >= 12) {
      reasoning.push(`Setor Crítico: Partição ${idx + 1} da pista em vácuo probabilístico.`);
      Object.keys(probs).forEach(t => {
        const term = parseInt(t);
        const inThisRegion = TERMINAL_GROUPS[term].some(n => WHEEL_REGIONS[idx].includes(n));
        if (inThisRegion) probs[term] += 15;
      });
    }
  });

  // Helper to apply bias with higher granularity
  const applyBias = (strategyName: string, baseWeight: number, terminal: number) => {
    let finalWeight = baseWeight;
    let biasInfo = "";

    // 1. Strategy Bias
    if (bias?.strategySuccess[strategyName]) {
      const success = bias.strategySuccess[strategyName];
      // Granular tiers
      const multiplier = success > 0.8 ? 1.5 : // Exceptional
                         success > 0.6 ? 1.25 : // Strong
                         success < 0.3 ? 0.4 :  // Failure
                         success < 0.45 ? 0.7 :  // Weak
                         1.0;
      
      if (multiplier !== 1.0) {
        finalWeight *= multiplier;
        biasInfo = `[${strategyName} Performance: ${Math.round(success * 100)}%]`;
      }
    }

    // 2. Terminal Bias (Global success for this specific terminal)
    if (bias?.terminalSuccess[terminal]) {
      const termSuccess = bias.terminalSuccess[terminal];
      finalWeight *= (1 + (termSuccess - 0.5) * 0.5); // Subtle adjustment based on terminal hit rate
    }

    probs[terminal] += finalWeight;
    if (biasInfo) reasoning.push(`Ajuste Neural: ${biasInfo}`);
    return strategyName;
  };

  // --- PDF STRATEGY 1: ELITE TRIGGERS (Brendo Santos) ---
  // Elite 2X
  if (lastTerminal === 4 || lastTerminal === 5) {
    const s = "ELITE 2X (Gatilho T4/T5 -> Alvo T2)";
    triggeredStrategy = applyBias(s, 45, 2);
    reasoning.push(triggeredStrategy);
  }
  // Quarta Dimensao
  if (lastTerminal === 1 || lastTerminal === 3) {
    const s = "QUARTA DIMENSÃO (Gatilho T1/T3 -> Alvo T4)";
    triggeredStrategy = triggeredStrategy || applyBias(s, 45, 4);
    reasoning.push(triggeredStrategy);
  }
  // Formula 5X
  if (lastTerminal === 6 || lastTerminal === 8) {
    const s = "FÓRMULA 5X (Gatilho T6/T8 -> Alvo T5)";
    triggeredStrategy = triggeredStrategy || applyBias(s, 45, 5);
    reasoning.push(triggeredStrategy);
  }
  // Alpha 6
  if (lastTerminal === 2 || lastTerminal === 9) {
    const s = "ALPHA 6 (Gatilho T2/T9 -> Alvo T6)";
    triggeredStrategy = triggeredStrategy || applyBias(s, 45, 6);
    reasoning.push(triggeredStrategy);
  }

  // --- PDF STRATEGY 2: PADRÃO BLACK ---
  if ([13, 31, 33].includes(lastNum)) {
    const s = "PADRÃO BLACK (Repetição com Vizinhos)";
    applyBias(s, 50, lastNum % 10);
    triggeredStrategy = s;
    reasoning.push(triggeredStrategy);
  }

  // --- NEW: REPETIÇÃO QUÂNTICA (2 Repetições de Terminal) ---
  const lastFourTerminals = history.slice(0, 4).map(n => n % 10);
  const termCounts: Record<number, number> = {};
  lastFourTerminals.forEach(t => termCounts[t] = (termCounts[t] || 0) + 1);
  
  Object.entries(termCounts).forEach(([t, count]) => {
    if (count >= 2) {
      const term = parseInt(t);
      const s = `REPETIÇÃO QUÂNTICA (Terminal ${term} repetido)`;
      applyBias(s, 55, term);
      triggeredStrategy = triggeredStrategy || s;
      reasoning.push(s);
    }
  });

  // --- PDF STRATEGY 3: PULL MAPPING (Chamada) ---
  const pullNumbers = PULL_MAPPING[lastNum] || [];
  pullNumbers.forEach((pNum, idx) => {
    const t = pNum % 10;
    // Weighted by priority in the mapping (first is stronger)
    probs[t] += (40 - (idx * 8));
  });
  if (pullNumbers.length > 0) {
    reasoning.push(`Chamada do número ${lastNum}: ${pullNumbers.join(', ')}`);
  }

  // 1. Region Analysis (Triangulation)
  history.forEach(num => {
    WHEEL_REGIONS.forEach((region, idx) => {
      if (region.includes(num)) regionsActivity[idx]++;
    });
  });

  regionsActivity.forEach((hits, idx) => {
    if (hits >= 3) {
      Object.keys(probs).forEach(t => {
        const term = parseInt(t);
        const inThisRegion = TERMINAL_GROUPS[term].some(n => WHEEL_REGIONS[idx].includes(n));
        if (!inThisRegion) probs[term] += 10;
      });
    }
  });

  // 3. Mirror & Arithmetic (Original User Request)
  if (MIRROR_PAIRS[lastNum]) probs[MIRROR_PAIRS[lastNum] % 10] += 25;
  
  const sumTerm = (Math.floor(lastNum / 10) + (lastNum % 10)) % 10;
  probs[sumTerm] += 15;

  // Suggest the terminal with highest logic accumulation
  let bestTerminal = null;
  let maxProb = 0;

  Object.entries(probs).forEach(([term, p]) => {
    const normalized = Math.min(95, Math.max(10, p + 15)); 
    probs[parseInt(term)] = normalized;
    if (normalized > maxProb) {
      maxProb = normalized;
      bestTerminal = parseInt(term);
    }
  });

  // Ensure high-confidence signal is only triggered if we have a strong convergence
  return {
    probabilities: probs,
    reasoning: Array.from(new Set(reasoning)), // Deduplicate
    suggestedTerminal: maxProb >= 82 ? bestTerminal : null,
    regionsActivity,
    triggeredStrategy
  };
};

export const getNeighbors = (num: number): number[] => {
  const idx = WHEEL_ORDER.indexOf(num);
  const prev = WHEEL_ORDER[(idx - 1 + 37) % 37];
  const next = WHEEL_ORDER[(idx + 1) % 37];
  return [prev, num, next];
};
