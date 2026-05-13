// Dashbord: stilling og kommende kamper.
import { requireAuth, clearSession } from "./auth.js";
import { supabase } from "./client.js";
import { getMatches, formatKickoff, isOpenForBetting } from "./football.js";
import { buildLeaderboard } from "./scoring.js";

const me = requireAuth();
if (!me) throw new Error("no auth");

document.getElementById("hello").textContent = "Hei, " + me.name;
document.getElementById("logout").addEventListener("click", () => {
  clearSession();
  window.location.href = "index.html";
});

if (me.is_admin) document.getElementById("admin-link").classList.remove("hidden");

async function loadLeaderboard() {
  const area = document.getElementById("leaderboard-area");
  const [players, matchBets, matchResults, tBets, tRes] = await Promise.all([
    supabase.from("tk_players").select("*"),
    supabase.from("tk_match_bets").select("*"),
    supabase.from("tk_match_results").select("*"),
    supabase.from("tk_tournament_bets").select("*"),
    supabase.from("tk_tournament_results").select("*").limit(1).maybeSingle(),
  ]);
  if (players.error) {
    area.innerHTML = `<div class="alert alert-error">${players.error.message}</div>`;
    return;
  }
  const lb = buildLeaderboard(
    players.data,
    matchBets.data || [],
    matchResults.data || [],
    tBets.data || [],
    tRes.data
  );
  if (lb.every((r) => r.total === 0)) {
    area.innerHTML = `<div class="card"><p class="muted mb-0">Ingen poeng registrert enda. Stillingen fylles ut etter hvert som resultater legges inn.</p></div>`;
    return;
  }
  area.innerHTML = `
    <div class="card">
      <table class="lb-table">
        <thead>
          <tr><th>#</th><th>Spiller</th><th class="num">Kamp</th><th class="num">Turn.</th><th class="num">Sum</th></tr>
        </thead>
        <tbody>
          ${lb
            .map(
              (r, i) => `
            <tr class="${r.player.id === me.id ? "you" : ""}">
              <td>${i + 1}</td>
              <td>${escapeHtml(r.player.name)}</td>
              <td class="num">${r.match_points}</td>
              <td class="num">${r.tournament_points}</td>
              <td class="num"><strong>${r.total}</strong></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

async function loadUpcoming() {
  const area = document.getElementById("upcoming-area");
  try {
    const matches = await getMatches();
    const open = matches.filter(isOpenForBetting).slice(0, 5);
    if (!open.length) {
      area.innerHTML = `<p class="muted">Ingen kommende kamper.</p>`;
      return;
    }
    area.innerHTML = `<div class="match-list">${open
      .map(
        (m) => `
      <a href="match.html?id=${m.id}" class="match-row">
        <div class="teams">${escapeHtml(m.homeTeam.name)} – ${escapeHtml(m.awayTeam.name)}</div>
        <div class="meta">
          <span>${formatKickoff(m.utcDate)}</span>
          <span class="status status-open">Tipp åpen</span>
        </div>
      </a>`
      )
      .join("")}</div>`;
  } catch (err) {
    area.innerHTML = `<div class="alert alert-warning">Kunne ikke hente kamper: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

loadLeaderboard();
loadUpcoming();
