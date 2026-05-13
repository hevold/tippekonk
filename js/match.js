// Enkeltkamp: tipp + se andres tipp + resultat.
import { requireAuth, clearSession } from "./auth.js";
import { supabase } from "./client.js";
import { getMatch, formatKickoff, isOpenForBetting } from "./football.js";
import { scoreMatchBet, MATCH_FIELDS } from "./scoring.js";

const me = requireAuth();
if (!me) throw new Error("no auth");

document.getElementById("hello").textContent = "Hei, " + me.name;
document.getElementById("logout").addEventListener("click", () => {
  clearSession();
  window.location.href = "index.html";
});
if (me.is_admin) document.getElementById("admin-link").classList.remove("hidden");

const params = new URLSearchParams(window.location.search);
const matchId = parseInt(params.get("id"), 10);

if (!matchId) {
  document.getElementById("match-header").innerHTML =
    `<div class="alert alert-error">Mangler kamp-id.</div>`;
  throw new Error("no match id");
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

function showAlert(type, msg) {
  document.getElementById("alert-area").innerHTML =
    `<div class="alert alert-${type}">${escapeHtml(msg)}</div>`;
}

async function load() {
  let match;
  try {
    match = await getMatch(matchId);
  } catch (err) {
    document.getElementById("match-header").innerHTML =
      `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    return;
  }

  document.getElementById("match-header").innerHTML = `
    <h1>${escapeHtml(match.homeTeam.name)} – ${escapeHtml(match.awayTeam.name)}</h1>
    <p class="muted">${formatKickoff(match.utcDate)} · ${escapeHtml(match.competition?.name || "VM")} · ${escapeHtml(match.status)}</p>
  `;

  const open = isOpenForBetting(match);

  const [myBet, allBets, result, players] = await Promise.all([
    supabase.from("tk_match_bets").select("*").eq("player_id", me.id).eq("match_id", matchId).maybeSingle(),
    supabase.from("tk_match_bets").select("*").eq("match_id", matchId),
    supabase.from("tk_match_results").select("*").eq("match_id", matchId).maybeSingle(),
    supabase.from("tk_players").select("id, name"),
  ]);

  const bet = myBet.data;
  const players_by_id = new Map((players.data || []).map((p) => [p.id, p]));

  // Skjema
  const formArea = document.getElementById("match-form-area");
  if (open) {
    renderForm(formArea, bet);
  } else {
    formArea.innerHTML = bet
      ? renderBetReadonly(bet)
      : `<div class="alert alert-warning">Tippefrist gått ut og du tippet ikke.</div>`;
  }

  // Resultat
  const resArea = document.getElementById("match-result-area");
  if (result.data) {
    const score = bet ? scoreMatchBet(bet, result.data) : null;
    resArea.innerHTML = `
      <h2>Resultat</h2>
      <div class="card">
        ${MATCH_FIELDS.map((f) => `
          <div class="pts-row">
            <span class="label">${f.label}</span>
            <span>${escapeHtml(result.data[f.key] ?? "—")}</span>
          </div>`).join("")}
        ${score ? `
          <hr style="border:none; border-top:1px solid var(--border); margin:10px 0;">
          <div class="pts-row"><span class="label">Dine poeng</span><strong>${score.total}</strong></div>
        ` : ""}
      </div>
    `;
  }

  // Andres tipp — vis bare etter at tippet er stengt
  const othersArea = document.getElementById("others-area");
  if (open) {
    othersArea.innerHTML = `<p class="muted">Andres tipp vises etter at tippefristen er ute.</p>`;
  } else if (!allBets.data || !allBets.data.length) {
    othersArea.innerHTML = `<p class="muted">Ingen tippet på denne kampen.</p>`;
  } else {
    othersArea.innerHTML = `
      <div class="card">
        ${allBets.data.map((b) => {
          const p = players_by_id.get(b.player_id);
          const pts = result.data ? scoreMatchBet(b, result.data).total : null;
          return `
            <div class="pts-row">
              <span><strong>${escapeHtml(p?.name || "?")}</strong> ${b.home_goals ?? "-"}–${b.away_goals ?? "-"} · ${escapeHtml(b.first_scorer || "—")}</span>
              ${pts !== null ? `<span class="pts-badge${pts === 0 ? " zero" : ""}">${pts}p</span>` : ""}
            </div>`;
        }).join("")}
      </div>
    `;
  }
}

function renderBetReadonly(bet) {
  return `<div class="card">
    ${MATCH_FIELDS.map((f) => `
      <div class="pts-row">
        <span class="label">${f.label}</span>
        <span>${escapeHtml(bet[f.key] ?? "—")}</span>
      </div>`).join("")}
  </div>`;
}

function renderForm(area, bet) {
  area.innerHTML = `
    <form id="bet-form" class="form-body card">
      <div class="field-row">
        <div class="field">
          <label for="home_goals">Hjemme mål</label>
          <input id="home_goals" type="number" min="0" value="${bet?.home_goals ?? ""}" />
        </div>
        <div class="field">
          <label for="away_goals">Borte mål</label>
          <input id="away_goals" type="number" min="0" value="${bet?.away_goals ?? ""}" />
        </div>
      </div>
      <div class="field">
        <label for="first_scorer">Første målscorer (eksakt navn)</label>
        <input id="first_scorer" type="text" value="${escapeHtml(bet?.first_scorer ?? "")}" />
        <small class="muted">Skriv full spillerlinje slik den står hos football-data.org, f.eks. «Erling Haaland».</small>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="home_yellow">Gule kort hjemme</label>
          <input id="home_yellow" type="number" min="0" value="${bet?.home_yellow ?? ""}" />
        </div>
        <div class="field">
          <label for="away_yellow">Gule kort borte</label>
          <input id="away_yellow" type="number" min="0" value="${bet?.away_yellow ?? ""}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="home_red">Røde kort hjemme</label>
          <input id="home_red" type="number" min="0" value="${bet?.home_red ?? ""}" />
        </div>
        <div class="field">
          <label for="away_red">Røde kort borte</label>
          <input id="away_red" type="number" min="0" value="${bet?.away_red ?? ""}" />
        </div>
      </div>
      <button class="btn" type="submit">${bet ? "Oppdater tipp" : "Lagre tipp"}</button>
    </form>
  `;

  document.getElementById("bet-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      player_id: me.id,
      match_id: matchId,
      home_goals: numOrNull("home_goals"),
      away_goals: numOrNull("away_goals"),
      first_scorer: strOrNull("first_scorer"),
      home_yellow: numOrNull("home_yellow"),
      away_yellow: numOrNull("away_yellow"),
      home_red: numOrNull("home_red"),
      away_red: numOrNull("away_red"),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("tk_match_bets")
      .upsert(payload, { onConflict: "player_id,match_id" });
    if (error) showAlert("error", error.message);
    else {
      showAlert("success", "Tipp lagret.");
      load();
    }
  });
}

function numOrNull(id) {
  const v = document.getElementById(id).value;
  if (v === "" || v === null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function strOrNull(id) {
  const v = document.getElementById(id).value.trim();
  return v ? v : null;
}

load();
