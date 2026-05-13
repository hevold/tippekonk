// Norske lagnavn for VM 2026. Keyed på FIFA TLA. Hvis et lag mangler her,
// faller koden tilbake til engelsk navn fra API-et.
export const TEAMS_NO = {
  URY: "Uruguay",
  GER: "Tyskland",
  ESP: "Spania",
  PAR: "Paraguay",
  ARG: "Argentina",
  GHA: "Ghana",
  BRA: "Brasil",
  POR: "Portugal",
  JPN: "Japan",
  MEX: "Mexico",
  ENG: "England",
  USA: "USA",
  KOR: "Sør-Korea",
  FRA: "Frankrike",
  RSA: "Sør-Afrika",
  ALG: "Algerie",
  AUS: "Australia",
  NZL: "New Zealand",
  SUI: "Sveits",
  ECU: "Ecuador",
  SWE: "Sverige",
  CZE: "Tsjekkia",
  CRO: "Kroatia",
  KSA: "Saudi-Arabia",
  TUN: "Tunisia",
  TUR: "Tyrkia",
  SEN: "Senegal",
  BEL: "Belgia",
  MAR: "Marokko",
  AUT: "Østerrike",
  COL: "Colombia",
  EGY: "Egypt",
  CAN: "Canada",
  HAI: "Haiti",
  IRN: "Iran",
  BIH: "Bosnia-Hercegovina",
  PAN: "Panama",
  CPV: "Kapp Verde",
  COD: "DR Kongo",
  CIV: "Elfenbenskysten",
  QAT: "Qatar",
  JOR: "Jordan",
  IRQ: "Irak",
  UZB: "Usbekistan",
  NED: "Nederland",
  NOR: "Norge",
  SCO: "Skottland",
  CUR: "Curaçao",
};

export function teamNo(team) {
  if (!team) return "?";
  return TEAMS_NO[team.tla] || team.name || "?";
}

export function teamShort(team) {
  if (!team) return "?";
  const full = teamNo(team);
  // Korte for de lengste navnene i smale layouts
  return full
    .replace("Bosnia-Hercegovina", "Bosnia-H.")
    .replace("Elfenbenskysten", "Elfenbensk.")
    .replace("Saudi-Arabia", "Saudi-Ar.");
}
