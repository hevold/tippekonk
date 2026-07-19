// Poengberegning. Holdes ren — ingen DB-kall, ingen DOM. Lett å unit-teste.
//
// Kamp: 1p for riktig utfall (hjemmeseier/uavgjort/bortseier), 1p for eksakt
// hjemme mål, 1p for eksakt borte mål. Maks 3p per kamp.
//
// Turnering: hvert tekst- og boolean-felt gir 5p eksakt. total_goals 5p ved ±5.

function outcomeOf(h, a) {
  if (h === null || h === undefined || a === null || a === undefined) return null;
  if (h > a) return "H";
  if (h < a) return "A";
  return "U";
}

function scoreOutcome(bet, result) {
  const bo = outcomeOf(bet.home_goals, bet.away_goals);
  const ro = outcomeOf(result.home_goals, result.away_goals);
  if (!bo || !ro) return 0;
  return bo === ro ? 1 : 0;
}

function scoreExactGoals(field) {
  return (bet, result) => {
    const b = bet[field], r = result[field];
    if (b === null || b === undefined || r === null || r === undefined) return 0;
    return Number(b) === Number(r) ? 1 : 0;
  };
}

export const MATCH_FIELDS = [
  { key: "outcome",    label: "Riktig utfall (H/U/B)", computed: true,           scorer: scoreOutcome },
  { key: "home_goals", label: "Hjemme mål eksakt",     scorer: scoreExactGoals("home_goals") },
  { key: "away_goals", label: "Borte mål eksakt",      scorer: scoreExactGoals("away_goals") },
];

export function scoreMatchBet(bet, result) {
  if (!bet || !result) return { total: 0, breakdown: [] };
  const breakdown = MATCH_FIELDS.map((f) => {
    const pts = f.scorer(bet, result);
    return {
      key: f.key,
      label: f.label,
      bet: f.computed ? outcomeLabel(outcomeOf(bet.home_goals, bet.away_goals)) : bet[f.key],
      actual: f.computed ? outcomeLabel(outcomeOf(result.home_goals, result.away_goals)) : result[f.key],
      points: pts,
    };
  });
  return {
    total: breakdown.reduce((s, b) => s + b.points, 0),
    breakdown,
  };
}

function outcomeLabel(o) {
  if (o === "H") return "Hjemmeseier";
  if (o === "U") return "Uavgjort";
  if (o === "A") return "Bortseier";
  return "—";
}

// Turnering — riktig tekstfelt gir 5p. total_goals: ±5 gir 5p.
// Navnematching: ren eksakt tekst er for strengt — «Mbappe» skal matche fasit
// «Kylian Mbappé». Normaliser (småbokstaver, uten aksenter/tegnsetting) og
// godta at det korteste navnets ord er et subsett av det lengste. Dermed
// matcher også «Congo DR» ↔ «DR Congo», men «Kane» matcher aldri «Mbappé».
function nameTokens(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreExactText(bet, actual) {
  if (!bet || !actual) return 0;
  const a = nameTokens(bet), b = nameTokens(actual);
  if (!a.length || !b.length) return 0;
  const [short_, long_] = a.length <= b.length ? [a, b] : [b, a];
  const longSet = new Set(long_);
  return short_.every((t) => longSet.has(t)) ? 5 : 0;
}

function scoreBoolean(bet, actual) {
  if (bet === null || bet === undefined || actual === null || actual === undefined) return 0;
  return bet === actual ? 5 : 0;
}

function scoreTotalGoals(bet, actual) {
  if (bet === null || bet === undefined || actual === null || actual === undefined) return 0;
  return Math.abs(Number(bet) - Number(actual)) <= 5 ? 5 : 0;
}

export const TOURNAMENT_FIELDS = [
  { key: "winner", label: "Vinner", scorer: scoreExactText, type: "text" },
  { key: "top_scorer", label: "Toppscorer", scorer: scoreExactText, type: "text" },
  { key: "golden_glove", label: "Beste keeper", scorer: scoreExactText, type: "text" },
  { key: "most_goals_team", label: "Lag med flest mål", scorer: scoreExactText, type: "team" },
  { key: "most_yellow_cards_team", label: "Lag med flest gule", scorer: scoreExactText, type: "team" },
  { key: "most_red_cards_team", label: "Lag med flest røde", scorer: scoreExactText, type: "team" },
  { key: "total_goals", label: "Totalt antall mål (±5)", scorer: scoreTotalGoals, type: "number" },
  { key: "final_extra_time", label: "Finalen til ekstraomganger", scorer: scoreBoolean, type: "boolean" },
];

export function scoreTournamentBet(bet, result) {
  if (!bet || !result) return { total: 0, breakdown: [] };
  const breakdown = TOURNAMENT_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    bet: bet[f.key],
    actual: result[f.key],
    points: f.scorer(bet[f.key], result[f.key]),
  }));
  return {
    total: breakdown.reduce((s, b) => s + b.points, 0),
    breakdown,
  };
}

// Aggreger totalpoeng for alle spillere
export function buildLeaderboard(players, matchBets, matchResults, tournamentBets, tournamentResult) {
  const resultByMatch = new Map();
  for (const r of matchResults) resultByMatch.set(r.match_id, r);
  const tBetByPlayer = new Map();
  for (const b of tournamentBets) tBetByPlayer.set(b.player_id, b);

  return players
    .map((p) => {
      const pMatchBets = matchBets.filter((b) => b.player_id === p.id);
      let matchPts = 0;
      for (const mb of pMatchBets) {
        const r = resultByMatch.get(mb.match_id);
        if (!r) continue;
        matchPts += scoreMatchBet(mb, r).total;
      }
      const tBet = tBetByPlayer.get(p.id);
      const tournamentPts = tournamentResult && tBet ? scoreTournamentBet(tBet, tournamentResult).total : 0;
      return {
        player: p,
        match_points: matchPts,
        tournament_points: tournamentPts,
        total: matchPts + tournamentPts,
      };
    })
    .sort((a, b) => b.total - a.total);
}
