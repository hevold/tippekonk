// Poengberegning. Holdes ren — ingen DB-kall, ingen DOM. Lett å unit-teste.

// Tall-felt for kamper. Eksakt = 3p, ±1 = 1p.
function scoreNumberField(bet, actual) {
  if (bet === null || bet === undefined || actual === null || actual === undefined) return 0;
  const diff = Math.abs(Number(bet) - Number(actual));
  if (diff === 0) return 3;
  if (diff === 1) return 1;
  return 0;
}

// First scorer — eksakt match, case-insensitiv, trim. 3p.
function scoreFirstScorer(bet, actual) {
  if (!bet || !actual) return 0;
  const a = String(bet).trim().toLowerCase();
  const b = String(actual).trim().toLowerCase();
  return a === b ? 3 : 0;
}

export const MATCH_FIELDS = [
  { key: "home_goals", label: "Hjemme mål", scorer: scoreNumberField },
  { key: "away_goals", label: "Borte mål", scorer: scoreNumberField },
  { key: "first_scorer", label: "Første målscorer", scorer: scoreFirstScorer },
  { key: "home_yellow", label: "Gule kort hjemme", scorer: scoreNumberField },
  { key: "away_yellow", label: "Gule kort borte", scorer: scoreNumberField },
  { key: "home_red", label: "Røde kort hjemme", scorer: scoreNumberField },
  { key: "away_red", label: "Røde kort borte", scorer: scoreNumberField },
];

export function scoreMatchBet(bet, result) {
  if (!bet || !result) return { total: 0, breakdown: [] };
  const breakdown = MATCH_FIELDS.map((f) => ({
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

// Turnering — alle eksakte tekstfelt gir 5p. total_goals: ±5 gir 5p.
function scoreExactText(bet, actual) {
  if (!bet || !actual) return 0;
  return String(bet).trim().toLowerCase() === String(actual).trim().toLowerCase() ? 5 : 0;
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
