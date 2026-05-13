// Liste over kamper med filter.
import { requireAuth, clearSession } from "./auth.js";
import { supabase } from "./client.js";
import { getMatches, formatKickoff, isOpenForBetting } from "./football.js";

const me = requireAuth();
if (!me) throw new Error("no auth");

document.getElementById("hello").textContent = "Hei, " + me.name;
document.getElementById("logout").addEventListener("click", () => {
  clearSession();
  window.location.href = "index.html";
});
if (me.is_admin) document.getElementById("admin-link").classList.remove("hidden");

const tabs = document.querySelectorAll(".tabs button");
let filter = "open";
let allMatches = [];
let myBets = new Set();

tabs.forEach((b) =>
  b.addEventListener("click", () => {
    tabs.forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    filter = b.dataset.filter;
    render();
  })
);

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function render() {
  const area = document.getElementById("match-list-area");
  let list = allMatches;
  if (filter === "open") list = list.filter(isOpenForBetting);
  else if (filter === "done") list = list.filter((m) => m.status === "FINISHED");

  list.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

  if (!list.length) {
    area.innerHTML = `<p class="muted">Ingen kamper i denne kategorien.</p>`;
    return;
  }

  area.innerHTML = `<div class="match-list">${list
    .map((m) => {
      const open = isOpenForBetting(m);
      const done = m.status === "FINISHED";
      let statusEl = "";
      if (open) statusEl = `<span class="status status-open">${myBets.has(m.id) ? "Tippet" : "Tipp åpen"}</span>`;
      else if (done) statusEl = `<span class="status status-done">Ferdig</span>`;
      else statusEl = `<span class="status status-live">Live/stengt</span>`;

      let score = "";
      if (done && m.score?.fullTime) {
        score = ` <strong>${m.score.fullTime.home ?? "-"} – ${m.score.fullTime.away ?? "-"}</strong>`;
      }

      return `
        <a href="match.html?id=${m.id}" class="match-row">
          <div class="teams">${escapeHtml(m.homeTeam.name)} – ${escapeHtml(m.awayTeam.name)}${score}</div>
          <div class="meta">
            <span>${formatKickoff(m.utcDate)}</span>
            ${statusEl}
          </div>
        </a>`;
    })
    .join("")}</div>`;
}

async function load() {
  try {
    const [matches, bets] = await Promise.all([
      getMatches(),
      supabase.from("tk_match_bets").select("match_id").eq("player_id", me.id),
    ]);
    allMatches = matches;
    myBets = new Set((bets.data || []).map((b) => b.match_id));
    render();
  } catch (err) {
    document.getElementById("match-list-area").innerHTML =
      `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
}

load();
