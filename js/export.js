// Excel-eksport av hele tippekonken. Bruker SheetJS som lastes som UMD-script
// i HTML-en (window.XLSX).
//
// Modi:
//   asUser: <playerId>  → vanlig bruker. Andres kamp-bets vises kun for kamper
//                          som ikke lenger er åpne. Egne bets alltid synlige.
//                          Turneringsbets vises kun etter at resultatet er publisert.
//   asUser: null         → admin. Alt synlig.
import { supabase } from "./client.js";
import { getMatches, isOpenForBetting } from "./football.js";
import { teamNo } from "./teams-no.js";
import { TOURNAMENT_FIELDS, scoreMatchBet, scoreTournamentBet, buildLeaderboard } from "./scoring.js";

const STAGE_LABEL = {
  GROUP_STAGE: "Gruppespill",
  LAST_32: "Sekstendelsfinale",
  LAST_16: "Åttendedelsfinale",
  QUARTER_FINALS: "Kvartfinale",
  SEMI_FINALS: "Semifinale",
  THIRD_PLACE: "Bronsefinale",
  FINAL: "Finale",
};

export async function exportToExcel({ asUser = null } = {}) {
  if (!window.XLSX) throw new Error("XLSX-biblioteket lastet ikke. Sjekk nett-tilgang.");

  const [matches, players, matchBets, matchResults, tournamentBets, tournamentResult] = await Promise.all([
    getMatches(),
    supabase.from("tk_players").select("*"),
    supabase.from("tk_match_bets").select("*"),
    supabase.from("tk_match_results").select("*"),
    supabase.from("tk_tournament_bets").select("*"),
    supabase.from("tk_tournament_results").select("*").limit(1).maybeSingle(),
  ]);

  const matchById = new Map(matches.map((m) => [m.id, m]));
  const playerById = new Map((players.data || []).map((p) => [p.id, p]));
  const resultByMatch = new Map((matchResults.data || []).map((r) => [r.match_id, r]));
  const hasTournamentResult = !!tournamentResult.data;

  // Filter for vanlig bruker: andres bets bare på låste kamper
  const visibleMatchBets = (matchBets.data || []).filter((b) => {
    if (!asUser) return true; // admin
    if (b.player_id === asUser) return true;
    const m = matchById.get(b.match_id);
    return m ? !isOpenForBetting(m) : true;
  });
  const visibleTournamentBets = (tournamentBets.data || []).filter((b) => {
    if (!asUser) return true;
    if (b.player_id === asUser) return true;
    return hasTournamentResult;
  });

  // Sheet 1: Stilling — alltid full
  const lb = buildLeaderboard(
    players.data || [],
    matchBets.data || [],
    matchResults.data || [],
    tournamentBets.data || [],
    tournamentResult.data
  );
  const standingsRows = lb.map((r, i) => ({
    "#": i + 1,
    "Spiller": r.player.name,
    "Kamp-poeng": r.match_points,
    "Turnerings-poeng": r.tournament_points,
    "Totalt": r.total,
  }));

  // Sheet 2: Kamp-tipp
  const matchBetsRows = visibleMatchBets.map((b) => {
    const m = matchById.get(b.match_id);
    const p = playerById.get(b.player_id);
    const r = resultByMatch.get(b.match_id);
    const score = r ? scoreMatchBet(b, r) : { total: null, breakdown: [] };
    return {
      "Spiller": p?.name || "?",
      "Match-ID": b.match_id,
      "Runde": STAGE_LABEL[m?.stage] || m?.stage || "?",
      "Gruppe": m?.group?.replace("GROUP_", "") || "",
      "Dato": m ? new Date(m.utcDate).toLocaleString("nb-NO") : "",
      "Hjemmelag": m ? teamNo(m.homeTeam) : "?",
      "Bortelag": m ? teamNo(m.awayTeam) : "?",
      "Tippet hjemme": b.home_goals,
      "Tippet borte": b.away_goals,
      "Tippet vinner": b.winner || "",
      "Resultat hjemme": r?.home_goals ?? "",
      "Resultat borte": r?.away_goals ?? "",
      "Resultat vinner": r?.winner ?? "",
      "Poeng": score.total,
      "P utfall": score.breakdown[0]?.points ?? "",
      "P hjemme": score.breakdown[1]?.points ?? "",
      "P borte": score.breakdown[2]?.points ?? "",
      "Kamp-status": m?.status || "?",
    };
  });
  matchBetsRows.sort((a, b) => {
    if (a.Spiller !== b.Spiller) return a.Spiller.localeCompare(b.Spiller);
    return (a["Match-ID"] || 0) - (b["Match-ID"] || 0);
  });

  // Sheet 3: Turneringstipp
  const tournamentRows = visibleTournamentBets.map((b) => {
    const p = playerById.get(b.player_id);
    const score = tournamentResult.data ? scoreTournamentBet(b, tournamentResult.data) : { total: null };
    const row = { "Spiller": p?.name || "?" };
    for (const f of TOURNAMENT_FIELDS) {
      const v = b[f.key];
      row[f.label] = v === null || v === undefined ? "" :
                     typeof v === "boolean" ? (v ? "Ja" : "Nei") : v;
    }
    row["Poeng"] = score.total ?? "";
    return row;
  });

  // Sheet 4: Resultater — alltid full
  const resultsRows = (matchResults.data || []).map((r) => {
    const m = matchById.get(r.match_id);
    return {
      "Match-ID": r.match_id,
      "Runde": STAGE_LABEL[m?.stage] || m?.stage || "?",
      "Dato": m ? new Date(m.utcDate).toLocaleString("nb-NO") : "",
      "Hjemmelag": m ? teamNo(m.homeTeam) : "?",
      "Bortelag": m ? teamNo(m.awayTeam) : "?",
      "Hjemme mål": r.home_goals,
      "Borte mål": r.away_goals,
      "Vinner": r.winner || "",
      "Status": m?.status || "?",
    };
  });

  // Sheet 5: Spillere — alltid full, men admin-flagg bare i admin-mode
  const playerRows = (players.data || []).map((p) => {
    const row = {
      "Navn": p.name,
      "Registrert": new Date(p.created_at).toLocaleString("nb-NO"),
    };
    if (!asUser) row["Admin"] = p.is_admin ? "Ja" : "Nei";
    return row;
  });

  const wb = window.XLSX.utils.book_new();
  const addSheet = (name, rows) => {
    const ws = window.XLSX.utils.json_to_sheet(rows.length ? rows : [{ "Ingen data": "" }]);
    window.XLSX.utils.book_append_sheet(wb, ws, name);
  };
  addSheet("Stilling", standingsRows);
  addSheet("Kamp-tipp", matchBetsRows);
  addSheet("Turnerings-tipp", tournamentRows);
  addSheet("Resultater", resultsRows);
  addSheet("Spillere", playerRows);

  const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "");
  const suffix = asUser ? "spiller" : "admin";
  window.XLSX.writeFile(wb, `tippekonk-${stamp}-${suffix}.xlsx`);
}
