// Enkeltkamp: tipp + se andres tipp + resultat.
import { requireAuth, clearSession } from "./auth.js";
import { supabase } from "./client.js";
import { getMatch, formatKickoff, isOpenForBetting, getOdds } from "./football.js";
import { teamNo, teamTla } from "./teams-no.js";
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

  const hf = match.homeTeam.crest ? `<img class="flag flag-lg" src="${match.homeTeam.crest}" alt="" />` : "";
  const af = match.awayTeam.crest ? `<img class="flag flag-lg" src="${match.awayTeam.crest}" alt="" />` : "";
  document.getElementById("match-header").innerHTML = `
    <h1>${hf}${escapeHtml(teamNo(match.homeTeam))} – ${escapeHtml(teamNo(match.awayTeam))}${af}</h1>
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
    renderForm(formArea, bet, match);
  } else {
    formArea.innerHTML = bet
      ? renderBetReadonly(bet)
      : `<div class="alert alert-warning">Tippefrist gått ut og du tippet ikke.</div>`;
  }

  // Resultat
  const resArea = document.getElementById("match-result-area");
  if (result.data) {
    const score = bet ? scoreMatchBet(bet, result.data) : null;
    // Sluttspill scores på ordinær tid, men kampen kan ha endt annerledes etter
    // ekstraomganger/straffer — vis hele det ferdige resultatet fra API-et også,
    // ellers ser det lagrede (poenggivende) resultatet ut som en feil.
    const knockout = match.stage && match.stage !== "GROUP_STAGE";
    const ft = match.score?.fullTime;
    const pen = match.score?.penalties;
    // regularTime settes bare av football-data når kampen gikk til ekstraomganger
    const wentExtra = knockout && match.score?.regularTime?.home != null;
    const extraRows = [];
    if (wentExtra && ft?.home != null) extraRows.push(["Etter ekstraomganger", `${ft.home} – ${ft.away}`]);
    if (pen?.home != null) extraRows.push(["Straffespark", `${pen.home} – ${pen.away}`]);
    if (knockout && result.data.winner) {
      const adv = result.data.winner === "HOME" ? match.homeTeam : match.awayTeam;
      extraRows.push(["Videre", teamNo(adv)]);
    }
    resArea.innerHTML = `
      <h2>Resultat</h2>
      <div class="card">
        <div class="pts-row">
          <span class="label">${knockout ? "Etter ordinær tid (gir poeng)" : "Sluttresultat"}</span>
          <strong>${result.data.home_goals ?? "—"} – ${result.data.away_goals ?? "—"}</strong>
        </div>
        ${extraRows.map(([label, val]) => `
        <div class="pts-row">
          <span class="label">${escapeHtml(label)}</span>
          <strong>${escapeHtml(val)}</strong>
        </div>`).join("")}
        ${score ? `
          <hr style="border:none; border-top:1px solid var(--border); margin:10px 0;">
          ${score.breakdown.map(b => `
            <div class="pts-row">
              <span class="label">${escapeHtml(b.label)}</span>
              <span><span class="pts-badge${b.points === 0 ? " zero" : ""}">${b.points}p</span></span>
            </div>`).join("")}
          <div class="pts-row" style="margin-top:6px;border-top:1px solid var(--border);padding-top:8px;">
            <strong>Totalt</strong><strong>${score.total}p</strong>
          </div>
        ` : ""}
      </div>
    `;
  }

  // Odds — pynt, skal aldri knekke siden
  renderOdds(match);

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
              <span><strong>${escapeHtml(p?.name || "?")}</strong> ${b.home_goals ?? "-"}–${b.away_goals ?? "-"}</span>
              ${pts !== null ? `<span class="pts-badge${pts === 0 ? " zero" : ""}">${pts}p</span>` : ""}
            </div>`;
        }).join("")}
      </div>
    `;
  }
}

// ============ Odds (1X2) fra tre bettingselskaper ============
// football-data og The Odds API staver flere lag ulikt ("United States" vs
// "USA", "Congo DR" vs "DR Congo", "Czechia" vs "Czech Republic", …).
// All navnematching går derfor via teamTla() i teams-no.js, som slår opp
// alle kjente varianter (engelsk, norsk, shortName, TLA) og returnerer
// FIFA-koden. To lag er samme lag hvis og bare hvis TLA-ene er like.
function findOddsEvent(events, match) {
  const h = teamTla(match.homeTeam);
  const a = teamTla(match.awayTeam);
  if (!h || !a) return undefined;
  const t = new Date(match.utcDate).getTime();
  return events.find((e) => {
    const timeOk = Math.abs(new Date(e.commence_time).getTime() - t) < 24 * 3600 * 1000;
    return timeOk && teamTla(e.home_team) === h && teamTla(e.away_team) === a;
  });
}

function fmtOdds(v) {
  return v ? Number(v).toFixed(2) : "—";
}

async function renderOdds(match) {
  const area = document.getElementById("odds-area");
  if (!area) return;
  if (match.status === "FINISHED") {
    area.innerHTML = "";
    return;
  }
  try {
    const events = await getOdds();
    const ev = findOddsEvent(events, match);
    if (!ev || !ev.bookmakers?.length) {
      area.innerHTML = "";
      return;
    }
    const rows = ev.bookmakers
      .map((b) => {
        const o = { H: null, U: null, B: null };
        const homeTla = teamTla(ev.home_team);
        const awayTla = teamTla(ev.away_team);
        for (const out of b.outcomes || []) {
          const outTla = teamTla(out.name);
          if (outTla && outTla === homeTla) o.H = out.price;
          else if (outTla && outTla === awayTla) o.B = out.price;
          else o.U = out.price; // "Draw" (eller ukjent navn)
        }
        return `<tr>
          <td>${escapeHtml(b.title)}</td>
          <td class="num">${fmtOdds(o.H)}</td>
          <td class="num">${fmtOdds(o.U)}</td>
          <td class="num">${fmtOdds(o.B)}</td>
        </tr>`;
      })
      .join("");
    area.innerHTML = `
      <h2>Odds (1X2)</h2>
      <div class="card">
        <table class="lb-table">
          <thead><tr><th>Selskap</th><th class="num">H</th><th class="num">U</th><th class="num">B</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="muted" style="font-size:0.78rem; margin:8px 0 0;">Kilde: The Odds API · oppdateres ca. hver 2. time · kun til underholdning</p>
      </div>`;
  } catch {
    area.innerHTML = "";
  }
}

function renderBetReadonly(bet) {
  return `<div class="card">
    <div class="pts-row">
      <span class="label">Ditt tipp</span>
      <strong>${bet.home_goals ?? "—"} – ${bet.away_goals ?? "—"}</strong>
    </div>
  </div>`;
}

function renderForm(area, bet, match) {
  const isKnockout = match && match.stage && match.stage !== "GROUP_STAGE";
  area.innerHTML = `
    <form id="bet-form" class="form-body card">
      <p class="muted mb-1">1p for riktig utfall, 1p for hver eksakt målscore. Maks 3p.</p>
      <div class="field-row">
        <div class="field">
          <label for="home_goals">Hjemme mål${isKnockout ? " (etter ord. tid)" : ""}</label>
          <input id="home_goals" type="number" min="0" value="${bet?.home_goals ?? ""}" />
        </div>
        <div class="field">
          <label for="away_goals">Borte mål${isKnockout ? " (etter ord. tid)" : ""}</label>
          <input id="away_goals" type="number" min="0" value="${bet?.away_goals ?? ""}" />
        </div>
      </div>
      <button class="btn" type="submit">${bet ? "Oppdater tipp" : "Lagre tipp"}</button>
    </form>
  `;

  document.getElementById("bet-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    // Vakt: kampen kan ha startet mens skjemaet sto åpent. Frist = avspark.
    if (!isOpenForBetting(match)) {
      showAlert("error", "Tippefristen er ute — kampen har startet.");
      load();
      return;
    }
    const payload = {
      player_id: me.id,
      match_id: matchId,
      home_goals: numOrNull("home_goals"),
      away_goals: numOrNull("away_goals"),
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
