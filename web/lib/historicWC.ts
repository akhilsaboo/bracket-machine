// Historic World Cup pedigree — REAL, auditable facts (FIFA World Cup finals,
// 1930–2022). Used by the "Historic Nostalgist" auto-fill persona to favor
// traditional powerhouses. `titles` = tournaments won; `finals` = total final
// appearances (wins + runner-up). Nations not listed have no WC final pedigree.
// Source: FIFA World Cup final results, 1930–2022.

export interface WCHistory {
  titles: number;
  finals: number;
}

export const WC_HISTORY: Record<string, WCHistory> = {
  BRA: { titles: 5, finals: 7 }, // 1958, 62, 70, 94, 2002 (+ '50, '98 lost)
  GER: { titles: 4, finals: 8 }, // 1954, 74, 90, 2014 (incl. West Germany)
  ITA: { titles: 4, finals: 6 }, // 1934, 38, 82, 2006
  ARG: { titles: 3, finals: 6 }, // 1978, 86, 2022
  FRA: { titles: 2, finals: 4 }, // 1998, 2018
  URU: { titles: 2, finals: 2 }, // 1930, 50
  ENG: { titles: 1, finals: 1 }, // 1966
  ESP: { titles: 1, finals: 1 }, // 2010
  NED: { titles: 0, finals: 3 }, // 1974, 78, 2010 (all lost)
  CRO: { titles: 0, finals: 1 }, // 2018 lost
  SWE: { titles: 0, finals: 1 }, // 1958 lost
};

/** Legacy weight: titles count for far more than mere final appearances. */
export function legacyScore(code: string): number {
  const h = WC_HISTORY[code];
  if (!h) return 0;
  return h.titles * 3 + h.finals;
}
