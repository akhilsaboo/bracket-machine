// Stylised home-kit colours for the Vibe Archivist jersey duel. These are
// best-effort representations of each nation's TRADITIONAL home kit (primary +
// accent colour, plus a broad pattern) — NOT copies of official 2026 artwork.
// We draw our own simple jersey shape from these colours (see JerseySvg), so
// there's no licensed imagery involved. Colours are well-known/auditable; tweak
// freely as real 2026 kits are confirmed.

export type KitPattern = "solid" | "stripes" | "checker";

export interface Kit {
  primary: string; // main shirt colour
  accent: string; // collar / trim / stripe colour
  pattern: KitPattern;
}

// Fallback for any code missing below.
const DEFAULT_KIT: Kit = { primary: "#cccccc", accent: "#333333", pattern: "solid" };

export const TEAM_KITS: Record<string, Kit> = {
  RSA: { primary: "#fcb813", accent: "#007a4d", pattern: "solid" },
  CZE: { primary: "#d7141a", accent: "#ffffff", pattern: "solid" },
  KOR: { primary: "#cd2e3a", accent: "#0a2463", pattern: "solid" },
  MEX: { primary: "#006847", accent: "#ce1126", pattern: "solid" },
  BIH: { primary: "#002395", accent: "#ffd700", pattern: "solid" },
  QAT: { primary: "#8a1538", accent: "#ffffff", pattern: "solid" },
  CAN: { primary: "#d52b1e", accent: "#ffffff", pattern: "solid" },
  SUI: { primary: "#d52b1e", accent: "#ffffff", pattern: "solid" },
  HAI: { primary: "#00209f", accent: "#d21034", pattern: "solid" },
  SCO: { primary: "#18457b", accent: "#ffffff", pattern: "solid" },
  MAR: { primary: "#c1272d", accent: "#006233", pattern: "solid" },
  BRA: { primary: "#ffdf00", accent: "#009b3a", pattern: "solid" },
  PAR: { primary: "#d52b1e", accent: "#ffffff", pattern: "stripes" },
  AUS: { primary: "#fcd116", accent: "#00843d", pattern: "solid" },
  TUR: { primary: "#e30a17", accent: "#ffffff", pattern: "solid" },
  USA: { primary: "#ffffff", accent: "#002868", pattern: "solid" },
  CUR: { primary: "#002b7f", accent: "#f9e814", pattern: "solid" },
  CIV: { primary: "#f77f00", accent: "#009e60", pattern: "solid" },
  ECU: { primary: "#ffd100", accent: "#003893", pattern: "solid" },
  GER: { primary: "#ffffff", accent: "#000000", pattern: "solid" },
  TUN: { primary: "#e70013", accent: "#ffffff", pattern: "solid" },
  SWE: { primary: "#fecc00", accent: "#006aa7", pattern: "solid" },
  JPN: { primary: "#002fa7", accent: "#ffffff", pattern: "solid" },
  NED: { primary: "#ff7f00", accent: "#ffffff", pattern: "solid" },
  NZL: { primary: "#ffffff", accent: "#000000", pattern: "solid" },
  EGY: { primary: "#ce1126", accent: "#000000", pattern: "solid" },
  IRN: { primary: "#ffffff", accent: "#239f40", pattern: "solid" },
  BEL: { primary: "#e30613", accent: "#000000", pattern: "solid" },
  CPV: { primary: "#003893", accent: "#ffffff", pattern: "solid" },
  KSA: { primary: "#ffffff", accent: "#006c35", pattern: "solid" },
  URU: { primary: "#5cbceb", accent: "#ffffff", pattern: "solid" },
  ESP: { primary: "#c60b1e", accent: "#ffc400", pattern: "solid" },
  IRQ: { primary: "#ffffff", accent: "#007a3d", pattern: "solid" },
  NOR: { primary: "#ba0c2f", accent: "#ffffff", pattern: "solid" },
  SEN: { primary: "#ffffff", accent: "#00853f", pattern: "solid" },
  FRA: { primary: "#1d3a8a", accent: "#ffffff", pattern: "solid" },
  JOR: { primary: "#ffffff", accent: "#ce1126", pattern: "solid" },
  ALG: { primary: "#ffffff", accent: "#006233", pattern: "solid" },
  AUT: { primary: "#ef3340", accent: "#ffffff", pattern: "solid" },
  ARG: { primary: "#75aadb", accent: "#ffffff", pattern: "stripes" },
  UZB: { primary: "#ffffff", accent: "#1eb53a", pattern: "solid" },
  COD: { primary: "#007fff", accent: "#f7d618", pattern: "solid" },
  COL: { primary: "#fcd116", accent: "#003893", pattern: "solid" },
  POR: { primary: "#9d1b30", accent: "#006600", pattern: "solid" },
  GHA: { primary: "#ffffff", accent: "#006b3f", pattern: "solid" },
  PAN: { primary: "#d21034", accent: "#ffffff", pattern: "solid" },
  CRO: { primary: "#e0001b", accent: "#ffffff", pattern: "checker" },
  ENG: { primary: "#ffffff", accent: "#001f5b", pattern: "solid" },
};

export const kitOf = (code: string): Kit => TEAM_KITS[code] ?? DEFAULT_KIT;
