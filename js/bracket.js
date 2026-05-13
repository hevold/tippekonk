// Standard 32-lag knockout bracket. FIFA har ikke publisert spillplanen for VM 2026 enda,
// så vi bruker en seeded bracket: 1v32, 16v17, 8v25 osv. Slik at vinner av M1 møter
// vinner av M2 i Last_16, vinner av M1/M2 møter vinner av M3/M4 i kvart, osv.
//
// Pairings basert på standard tournament bracket struktur:
//   QF1 = vinner(L16-1) vs vinner(L16-2)
//   L16-1 = vinner(L32-1) vs vinner(L32-2)
//   L32-1 = seed 1 vs seed 32
//   L32-2 = seed 16 vs seed 17

const L32_SEEDS = [
  [1, 32], [16, 17], [8, 25], [9, 24],
  [4, 29], [13, 20], [5, 28], [12, 21],
  [2, 31], [15, 18], [7, 26], [10, 23],
  [3, 30], [14, 19], [6, 27], [11, 22],
];

// Returns: array of 16 matches { id: 'L32-1', round: 'LAST_32', home, away, slot }
// `home` og `away` er enten et qualifier-objekt eller null hvis seed mangler.
export function buildLast32(seededQualifiers) {
  const bySeed = new Map(seededQualifiers.map((q) => [q.seed, q]));
  return L32_SEEDS.map(([h, a], i) => ({
    id: `L32-${i + 1}`,
    round: "LAST_32",
    home: bySeed.get(h) || null,
    away: bySeed.get(a) || null,
    slot: i,
  }));
}

// Bygger en runde basert på vinnere fra forrige.
// `winners` er array av { matchId, winner: 'HOME'|'AWAY' } eller null hvis ikke valgt.
function buildNextRound(prevMatches, winners, roundName, prefix) {
  const winnerByMatch = new Map(winners.map((w) => [w.matchId, w]));
  const out = [];
  for (let i = 0; i < prevMatches.length; i += 2) {
    const m1 = prevMatches[i];
    const m2 = prevMatches[i + 1];
    const w1 = winnerByMatch.get(m1.id);
    const w2 = winnerByMatch.get(m2.id);
    out.push({
      id: `${prefix}-${out.length + 1}`,
      round: roundName,
      home: w1 ? (w1.winner === "HOME" ? m1.home : m1.away) : null,
      away: w2 ? (w2.winner === "HOME" ? m2.home : m2.away) : null,
      slot: out.length,
      sourceMatches: [m1.id, m2.id],
    });
  }
  return out;
}

export function buildLast16(last32, winners) {
  return buildNextRound(last32, winners, "LAST_16", "L16");
}

export function buildQuarters(last16, winners) {
  return buildNextRound(last16, winners, "QUARTER_FINALS", "QF");
}

export function buildSemis(quarters, winners) {
  return buildNextRound(quarters, winners, "SEMI_FINALS", "SF");
}

// Finale + bronse — bronse er taperne av semis
export function buildFinal(semis, winners) {
  const winnerByMatch = new Map(winners.map((w) => [w.matchId, w]));
  const w1 = winnerByMatch.get(semis[0]?.id);
  const w2 = winnerByMatch.get(semis[1]?.id);
  return [{
    id: "FINAL-1",
    round: "FINAL",
    home: w1 ? (w1.winner === "HOME" ? semis[0].home : semis[0].away) : null,
    away: w2 ? (w2.winner === "HOME" ? semis[1].home : semis[1].away) : null,
    slot: 0,
  }];
}

export function buildThirdPlace(semis, winners) {
  const winnerByMatch = new Map(winners.map((w) => [w.matchId, w]));
  const w1 = winnerByMatch.get(semis[0]?.id);
  const w2 = winnerByMatch.get(semis[1]?.id);
  return [{
    id: "THIRD-1",
    round: "THIRD_PLACE",
    home: w1 ? (w1.winner === "HOME" ? semis[0].away : semis[0].home) : null,
    away: w2 ? (w2.winner === "HOME" ? semis[1].away : semis[1].home) : null,
    slot: 0,
  }];
}

export const ROUND_LABEL = {
  LAST_32: "Sekstendelsfinale",
  LAST_16: "Åttendedelsfinale",
  QUARTER_FINALS: "Kvartfinale",
  SEMI_FINALS: "Semifinale",
  THIRD_PLACE: "Bronsefinale",
  FINAL: "Finale",
};
