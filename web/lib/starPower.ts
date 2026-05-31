// EDITORIAL "star power" for the FIFA Gamer persona — a SUBJECTIVE, hand-curated
// 0–100 score per nation reflecting how stacked its squad is with marquee
// individual talent (~2025-26), NOT EA Sports FC / FIFA game ratings and NOT a
// measured dataset. The whole point of the persona is "flashy superstar squads
// go far," so star-studded sides (France, Brazil, Argentina, Spain, Portugal,
// England) sit at the top, and a lone superstar lifts an otherwise modest side
// (e.g. Egypt/Salah, Norway/Haaland, South Korea/Son). Tweak freely.

export const STAR_POWER: Record<string, number> = {
  FRA: 95, // Mbappé & co.
  BRA: 92, // Vinícius, Rodrygo, Raphinha
  ESP: 90, // Yamal, Pedri, Rodri
  ARG: 90, // Messi, Álvarez
  POR: 90, // Ronaldo, B. Fernandes, Leão
  ENG: 90, // Bellingham, Kane, Saka, Foden
  GER: 85, // Musiala, Wirtz, Kimmich
  NED: 82, // Van Dijk, Gakpo, Reijnders
  NOR: 80, // Haaland, Ødegaard
  BEL: 78, // De Bruyne, Lukaku, Doku
  URU: 76, // Valverde, Núñez, Araújo
  MAR: 72, // Hakimi, Brahim Díaz
  EGY: 70, // Salah
  CRO: 70, // Modrić, Kovačić, Gvardiol
  TUR: 68, // Güler, Çalhanoğlu
  SEN: 68, // Mané, Koulibaly
  COL: 68, // James, Luis Díaz
  USA: 66, // Pulisic, McKennie
  JPN: 66, // Kubo, Mitoma
  SWE: 64, // Isak, Gyökeres
  MEX: 62, // squad depth
  KOR: 60, // Son
  AUT: 60, // Arnautović, Sabitzer
  SUI: 58, // depth
  CIV: 58, // Kessié, Haller
  CAN: 55, // Davies, Jonathan David
  ALG: 55, // Mahrez
  GHA: 52, // Kudus
  ECU: 52, // young core
  CZE: 50, // Schick, Hložek
  SCO: 50, // Robertson, McTominay
  IRN: 48, // Taremi, Azmoun
  BIH: 45, // Džeko
  AUS: 45,
  COD: 42,
  TUN: 40,
  PAR: 40,
  KSA: 38,
  RSA: 35,
  IRQ: 35,
  UZB: 35,
  PAN: 33,
  CPV: 33,
  QAT: 32,
  JOR: 32,
  NZL: 32,
  HAI: 30,
  CUR: 30,
};

export const starPowerOf = (code: string): number => STAR_POWER[code] ?? 40;
