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
  CUW: "Curaçao", // NB: FIFA-koden er CUW (var feilaktig CUR tidligere)
};

// Alle kjente engelske stavemåter per lag, på tvers av football-data.org
// (name + shortName) og The Odds API. Norske navn (TEAMS_NO) og TLA legges
// til automatisk i oppslaget under — de trenger ikke gjentas her.
export const TEAM_ALIASES = {
  URY: ["Uruguay"],
  GER: ["Germany"],
  ESP: ["Spain"],
  PAR: ["Paraguay"],
  ARG: ["Argentina"],
  GHA: ["Ghana"],
  BRA: ["Brazil"],
  POR: ["Portugal"],
  JPN: ["Japan"],
  MEX: ["Mexico"],
  ENG: ["England"],
  USA: ["United States", "USA"],
  KOR: ["South Korea", "Korea Republic"],
  FRA: ["France"],
  RSA: ["South Africa"],
  ALG: ["Algeria"],
  AUS: ["Australia"],
  NZL: ["New Zealand"],
  SUI: ["Switzerland"],
  ECU: ["Ecuador"],
  SWE: ["Sweden"],
  CZE: ["Czechia", "Czech Republic"],
  CRO: ["Croatia"],
  KSA: ["Saudi Arabia"],
  TUN: ["Tunisia"],
  TUR: ["Turkey", "Türkiye"],
  SEN: ["Senegal"],
  BEL: ["Belgium"],
  MAR: ["Morocco"],
  AUT: ["Austria"],
  COL: ["Colombia"],
  EGY: ["Egypt"],
  CAN: ["Canada"],
  HAI: ["Haiti"],
  IRN: ["Iran", "IR Iran"],
  BIH: ["Bosnia-Herzegovina", "Bosnia and Herzegovina", "Bosnia & Herzegovina", "Bosnia-H."],
  PAN: ["Panama"],
  CPV: ["Cape Verde Islands", "Cape Verde", "Cabo Verde"],
  COD: ["Congo DR", "DR Congo"],
  CIV: ["Ivory Coast", "Côte d'Ivoire"],
  QAT: ["Qatar"],
  JOR: ["Jordan"],
  IRQ: ["Iraq"],
  UZB: ["Uzbekistan"],
  NED: ["Netherlands", "Holland"],
  NOR: ["Norway"],
  SCO: ["Scotland"],
  CUW: ["Curaçao", "Curacao"],
};

// Normaliserer et lagnavn til sorterte ord-tokens, slik at ordrekkefølge,
// tegnsetting og småord ikke betyr noe: "Congo DR" === "DR Congo",
// "Bosnia and Herzegovina" === "Bosnia & Herzegovina" === "Bosnia-Herzegovina".
export function normTeamName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-zæøåéüç ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && w !== "and")
    .sort()
    .join(" ");
}

// Oppslag: normalisert navn (alle varianter: engelsk, norsk, TLA) → TLA.
const NORM_TO_TLA = (() => {
  const m = new Map();
  const add = (variant, tla) => {
    const key = normTeamName(variant);
    if (!key) return;
    if (m.has(key) && m.get(key) !== tla) {
      // Kollisjon mellom to lag — skal ikke skje. Ikke overskriv.
      console.warn(`teams-no: navnekollisjon for "${variant}" (${m.get(key)} vs ${tla})`);
      return;
    }
    m.set(key, tla);
  };
  for (const [tla, variants] of Object.entries(TEAM_ALIASES)) {
    add(tla, tla);
    for (const v of variants) add(v, tla);
  }
  for (const [tla, no] of Object.entries(TEAMS_NO)) add(no, tla);
  return m;
})();

// Finn TLA for et lag. Tar enten en streng (f.eks. navn fra The Odds API)
// eller et team-objekt fra football-data ({ name, shortName, tla }).
// Returnerer null hvis laget er ukjent.
export function teamTla(teamOrName) {
  if (teamOrName == null) return null;
  if (typeof teamOrName === "string") {
    return NORM_TO_TLA.get(normTeamName(teamOrName)) || null;
  }
  if (teamOrName.tla && TEAMS_NO[teamOrName.tla] !== undefined) return teamOrName.tla;
  return (
    NORM_TO_TLA.get(normTeamName(teamOrName.name)) ||
    NORM_TO_TLA.get(normTeamName(teamOrName.shortName)) ||
    teamOrName.tla ||
    null
  );
}

export function teamNo(team) {
  if (!team) return "?";
  const tla = teamTla(team);
  return (tla && TEAMS_NO[tla]) || team.name || "?";
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
