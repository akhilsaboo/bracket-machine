// FIFA 3-letter code -> emoji flag. Uses regional-indicator pairs for most
// nations; England/Scotland use subdivision tag sequences. Swap for SVG assets
// later for full cross-platform fidelity.

const ISO2: Record<string, string> = {
  MEX: "MX", RSA: "ZA", KOR: "KR", CZE: "CZ",
  CAN: "CA", BIH: "BA", QAT: "QA", SUI: "CH",
  BRA: "BR", MAR: "MA", HAI: "HT", SCO: "_SCO",
  USA: "US", PAR: "PY", AUS: "AU", TUR: "TR",
  GER: "DE", CUR: "CW", CIV: "CI", ECU: "EC",
  NED: "NL", JPN: "JP", SWE: "SE", TUN: "TN",
  BEL: "BE", EGY: "EG", IRN: "IR", NZL: "NZ",
  ESP: "ES", CPV: "CV", KSA: "SA", URU: "UY",
  FRA: "FR", SEN: "SN", NOR: "NO", IRQ: "IQ",
  ARG: "AR", ALG: "DZ", AUT: "AT", JOR: "JO",
  POR: "PT", COD: "CD", UZB: "UZ", COL: "CO",
  ENG: "_ENG", CRO: "HR", GHA: "GH", PAN: "PA",
};

const SUBDIVISION: Record<string, string> = {
  _ENG: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
  _SCO: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
};

function regionalIndicator(iso2: string): string {
  return [...iso2].map((c) => String.fromCodePoint(0x1f1e6 + (c.charCodeAt(0) - 65))).join("");
}

export function flag(code: string): string {
  const iso2 = ISO2[code];
  if (!iso2) return "\u{1F3F3}️"; // white flag fallback
  if (iso2.startsWith("_")) return SUBDIVISION[iso2] ?? "\u{1F3F3}️";
  return regionalIndicator(iso2);
}
