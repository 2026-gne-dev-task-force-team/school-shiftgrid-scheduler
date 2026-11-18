import { DEFAULT_WEIGHTS, SOFT_RULES } from '../gen/soft.js';

// 순수: 화면 값 → 저장할 「바꾼 것만」
export function diffFromDefault(w) {
  const out = { bands: {}, ruleBand: {}, tierMult: {}, avoidanceTierMult: {} };
  for (const k of ['bands', 'tierMult', 'avoidanceTierMult']) for (const [n, v] of Object.entries(w[k])) if (v !== DEFAULT_WEIGHTS[k][n]) out[k][n] = v;
  for (const [code, b] of Object.entries(w.ruleBand)) if (b && b !== SOFT_RULES[code].band) out.ruleBand[code] = b;
  return out;
}
