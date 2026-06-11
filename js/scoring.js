function norm(str) {
  return (str || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function numScore(bet, actual) {
  if (bet === null || bet === undefined || actual === null || actual === undefined) return 0;
  const diff = Math.abs(Number(bet) - Number(actual));
  if (diff === 0) return 3;
  if (diff === 1) return 1;
  return 0;
}

export function scoreMatch(bet, result) {
  if (!result || !bet) return 0;
  let pts = 0;
  pts += numScore(bet.home_goals, result.home_goals);
  pts += numScore(bet.away_goals, result.away_goals);
  if (bet.first_scorer && result.first_scorer) {
    if (norm(bet.first_scorer) === norm(result.first_scorer)) pts += 3;
  }
  pts += numScore(bet.home_yellow, result.home_yellow);
  pts += numScore(bet.away_yellow, result.away_yellow);
  pts += numScore(bet.home_red, result.home_red);
  pts += numScore(bet.away_red, result.away_red);
  return pts;
}

export function scoreTournament(bet, result) {
  if (!result || !bet) return 0;
  let pts = 0;
  const textFields = ['winner', 'top_scorer', 'most_yellow_cards_team', 'most_red_cards_team', 'golden_glove', 'most_goals_team'];
  for (const f of textFields) {
    if (bet[f] && result[f] && norm(bet[f]) === norm(result[f])) pts += 5;
  }
  if (bet.total_goals != null && result.total_goals != null) {
    if (Math.abs(Number(bet.total_goals) - Number(result.total_goals)) <= 5) pts += 5;
  }
  if (bet.final_extra_time != null && result.final_extra_time != null) {
    if (bet.final_extra_time === result.final_extra_time) pts += 5;
  }
  return pts;
}

export async function calcLeaderboard(db) {
  const [
    { data: players },
    { data: matchBets },
    { data: matchResults },
    { data: tBets },
    { data: tResults }
  ] = await Promise.all([
    db.from('tk_players').select('id, name'),
    db.from('tk_match_bets').select('*'),
    db.from('tk_match_results').select('*'),
    db.from('tk_tournament_bets').select('*'),
    db.from('tk_tournament_results').select('*').limit(1).maybeSingle()
  ]);

  const resultByMatch = {};
  for (const r of matchResults || []) resultByMatch[r.match_id] = r;

  const tournamentResult = tResults || null;

  return (players || []).map(p => {
    const myMatchBets = (matchBets || []).filter(b => b.player_id === p.id);
    const myTBet = (tBets || []).find(b => b.player_id === p.id);
    let pts = 0;
    for (const bet of myMatchBets) pts += scoreMatch(bet, resultByMatch[bet.match_id]);
    pts += scoreTournament(myTBet, tournamentResult);
    return { ...p, pts, hasMatchBets: myMatchBets.length > 0, hasTournamentBet: !!myTBet };
  }).sort((a, b) => b.pts - a.pts);
}
