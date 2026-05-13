// Beregner forventet sluttabell per gruppe basert på en spillers tipp.
// FIFA-tiebreaker: poeng → målforskjell → mål scoret → innbyrdes oppgjør → alfabetisk fallback.

function emptyRow(team) {
  return {
    team,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    points: 0,
    h2h: {}, // teamId -> {points, gd, gf}
  };
}

// Returnerer Map<groupKey, { teams: [Row], complete: bool, missing: number }>
export function computeGroupStandings(groupMatches, bets) {
  const betByMatch = new Map(bets.map((b) => [b.match_id, b]));
  const groups = new Map();

  for (const m of groupMatches) {
    const g = m.group;
    if (!groups.has(g)) groups.set(g, { rows: new Map(), missing: 0, total: 0 });
    const grp = groups.get(g);
    grp.total++;

    const bet = betByMatch.get(m.id);
    if (!bet || bet.home_goals === null || bet.home_goals === undefined ||
        bet.away_goals === null || bet.away_goals === undefined) {
      grp.missing++;
      continue;
    }

    const home = m.homeTeam;
    const away = m.awayTeam;
    if (!grp.rows.has(home.id)) grp.rows.set(home.id, emptyRow(home));
    if (!grp.rows.has(away.id)) grp.rows.set(away.id, emptyRow(away));
    const hr = grp.rows.get(home.id);
    const ar = grp.rows.get(away.id);

    const hg = bet.home_goals, ag = bet.away_goals;
    hr.played++; ar.played++;
    hr.gf += hg; hr.ga += ag; hr.gd = hr.gf - hr.ga;
    ar.gf += ag; ar.ga += hg; ar.gd = ar.gf - ar.ga;

    let hp = 0, ap = 0;
    if (hg > ag) { hr.wins++; ar.losses++; hp = 3; }
    else if (hg < ag) { ar.wins++; hr.losses++; ap = 3; }
    else { hr.draws++; ar.draws++; hp = 1; ap = 1; }
    hr.points += hp;
    ar.points += ap;

    // H2H
    if (!hr.h2h[away.id]) hr.h2h[away.id] = { points: 0, gd: 0, gf: 0 };
    if (!ar.h2h[home.id]) ar.h2h[home.id] = { points: 0, gd: 0, gf: 0 };
    hr.h2h[away.id].points += hp;
    hr.h2h[away.id].gd += hg - ag;
    hr.h2h[away.id].gf += hg;
    ar.h2h[home.id].points += ap;
    ar.h2h[home.id].gd += ag - hg;
    ar.h2h[home.id].gf += ag;
  }

  const result = new Map();
  for (const [g, grp] of groups) {
    const teams = Array.from(grp.rows.values()).sort((a, b) => compareRows(a, b));
    result.set(g, {
      teams,
      complete: grp.missing === 0 && grp.total > 0,
      missing: grp.missing,
      total: grp.total,
    });
  }
  return result;
}

// Sorterer fra best til verst etter FIFA-regler
function compareRows(a, b) {
  if (a.points !== b.points) return b.points - a.points;
  if (a.gd !== b.gd) return b.gd - a.gd;
  if (a.gf !== b.gf) return b.gf - a.gf;
  // H2H kun når kun to lag er tied (full FIFA-regelen er kompleks)
  const aV = a.h2h[b.team.id];
  const bV = b.h2h[a.team.id];
  if (aV && bV) {
    if (aV.points !== bV.points) return bV.points - aV.points;
    if (aV.gd !== bV.gd) return bV.gd - aV.gd;
    if (aV.gf !== bV.gf) return bV.gf - aV.gf;
  }
  // Alfabetisk fallback (vi har ikke FIFA-ranking eller fair play)
  return (a.team.name || "").localeCompare(b.team.name || "");
}

// Returnerer { qualified: [{team, group, position, points, gd, gf}], complete: bool, gaps: [groupKey] }
// position: 1, 2, eller 3 (for tredjeplasser som går videre)
export function computeQualifiers(standings) {
  const qualified = [];
  const gaps = [];
  const thirds = [];

  for (const [group, { teams, complete }] of standings) {
    if (!complete || teams.length < 2) {
      gaps.push(group);
      continue;
    }
    qualified.push({ ...rowSummary(teams[0]), group, position: 1 });
    qualified.push({ ...rowSummary(teams[1]), group, position: 2 });
    if (teams.length >= 3) {
      thirds.push({ ...rowSummary(teams[2]), group, position: 3 });
    }
  }

  // Topp 8 tredjeplasser
  thirds.sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    if (a.gd !== b.gd) return b.gd - a.gd;
    if (a.gf !== b.gf) return b.gf - a.gf;
    return (a.team.name || "").localeCompare(b.team.name || "");
  });
  qualified.push(...thirds.slice(0, 8));

  return {
    qualified,
    complete: gaps.length === 0,
    gaps,
    thirdsCount: thirds.length,
  };
}

function rowSummary(r) {
  return {
    team: r.team,
    points: r.points,
    gd: r.gd,
    gf: r.gf,
  };
}

// Globalt seed-rangering for bracket: alle 32 lag i 1-32 rangering basert på poeng/GD/GS,
// med plassering 1 > 2 > 3 som tiebreaker.
export function seedQualifiers(qualified) {
  const positionWeight = { 1: 0, 2: 1, 3: 2 };
  return qualified
    .slice()
    .sort((a, b) => {
      // Primært: posisjon (1 før 2 før 3)
      if (a.position !== b.position) return positionWeight[a.position] - positionWeight[b.position];
      // Innenfor samme posisjon: poeng → GD → GS
      if (a.points !== b.points) return b.points - a.points;
      if (a.gd !== b.gd) return b.gd - a.gd;
      if (a.gf !== b.gf) return b.gf - a.gf;
      return (a.team.name || "").localeCompare(b.team.name || "");
    })
    .map((q, i) => ({ ...q, seed: i + 1 }));
}
