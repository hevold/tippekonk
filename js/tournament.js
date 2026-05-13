// Turneringstipp.
import { requireAuth, clearSession } from "./auth.js";
import { supabase } from "./client.js";
import { scoreTournamentBet, TOURNAMENT_FIELDS } from "./scoring.js";
import { getTeams } from "./football.js";

const me = requireAuth();
if (!me) throw new Error("no auth");

document.getElementById("hello").textContent = "Hei, " + me.name;
document.getElementById("logout").addEventListener("click", () => {
  clearSession();
  window.location.href = "index.html";
});
if (me.is_admin) document.getElementById("admin-link").classList.remove("hidden");

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

let teams = [];

async function load() {
  const [bet, result, allBets, players, teamsRes] = await Promise.all([
    supabase.from("tk_tournament_bets").select("*").eq("player_id", me.id).maybeSingle(),
    supabase.from("tk_tournament_results").select("*").limit(1).maybeSingle(),
    supabase.from("tk_tournament_bets").select("*"),
    supabase.from("tk_players").select("id, name"),
    getTeams().catch(() => []),
  ]);
  teams = teamsRes;

  // Hvis resultat er publisert: lås tipp og vis resultat.
  const locked = !!result.data;
  renderForm(bet.data, locked);
  if (result.data) {
    renderResult(result.data, bet.data);
  } else {
    document.getElementById("result-area").innerHTML = "";
  }

  // Andres tipp — vis hvis resultat er ute eller hvis frist er passert (her: alltid synlig
  // for små vennegjenger, men kan strammes inn senere)
  const players_by_id = new Map((players.data || []).map((p) => [p.id, p]));
  const others = (allBets.data || []).filter((b) => b.player_id !== me.id);
  const othersArea = document.getElementById("others-area");
  if (!locked) {
    othersArea.innerHTML = `<p class="muted">Andres turneringstipp vises etter at resultatet er publisert.</p>`;
  } else if (!others.length) {
    othersArea.innerHTML = `<p class="muted">Ingen andre har tippet turnering.</p>`;
  } else {
    othersArea.innerHTML = `
      <div class="card">
        ${others.map((b) => {
          const p = players_by_id.get(b.player_id);
          const pts = result.data ? scoreTournamentBet(b, result.data).total : null;
          return `
            <details>
              <summary><strong>${escapeHtml(p?.name || "?")}</strong> ${pts !== null ? `<span class="pts-badge${pts === 0 ? " zero" : ""}">${pts}p</span>` : ""}</summary>
              ${TOURNAMENT_FIELDS.map((f) => `
                <div class="pts-row">
                  <span class="label">${f.label}</span>
                  <span>${escapeHtml(b[f.key] === true ? "Ja" : b[f.key] === false ? "Nei" : (b[f.key] ?? "—"))}</span>
                </div>
              `).join("")}
            </details>`;
        }).join("")}
      </div>
    `;
  }
}

function renderForm(bet, locked) {
  const area = document.getElementById("form-area");
  if (locked && !bet) {
    area.innerHTML = `<div class="alert alert-warning">Turneringen er ferdig og du har ikke tippet.</div>`;
    return;
  }

  const teamOptions = ['<option value="">—</option>']
    .concat(teams.map((t) => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`))
    .join("");

  const fieldHtml = (f) => {
    const v = bet?.[f.key];
    const lockedAttr = locked ? "disabled" : "";
    if (f.type === "team") {
      // Bygg select med valgt verdi
      let opts = teamOptions;
      if (v && !teams.find((t) => t.name === v)) {
        // bevar tidligere svar selv om teamet ikke er i listen lenger
        opts = `<option value="${escapeHtml(v)}" selected>${escapeHtml(v)}</option>` + opts;
      }
      return `
        <div class="field">
          <label>${f.label}</label>
          <select id="${f.key}" ${lockedAttr}>${opts.replace(`value="${escapeHtml(v ?? "")}"`, `value="${escapeHtml(v ?? "")}" selected`)}</select>
        </div>`;
    }
    if (f.type === "boolean") {
      return `
        <div class="field">
          <label>${f.label}</label>
          <div class="toggle-group">
            <button type="button" data-toggle="${f.key}" data-val="true" ${v === true ? 'class="active"' : ''} ${lockedAttr}>Ja</button>
            <button type="button" data-toggle="${f.key}" data-val="false" ${v === false ? 'class="active"' : ''} ${lockedAttr}>Nei</button>
          </div>
          <input type="hidden" id="${f.key}" value="${v === true ? 'true' : v === false ? 'false' : ''}" />
        </div>`;
    }
    if (f.type === "number") {
      return `
        <div class="field">
          <label>${f.label}</label>
          <input id="${f.key}" type="number" min="0" value="${v ?? ""}" ${lockedAttr} />
        </div>`;
    }
    return `
      <div class="field">
        <label>${f.label}</label>
        <input id="${f.key}" type="text" value="${escapeHtml(v ?? "")}" ${lockedAttr} />
      </div>`;
  };

  area.innerHTML = `
    <form id="t-form" class="form-body card">
      ${TOURNAMENT_FIELDS.map(fieldHtml).join("")}
      ${locked ? "" : `<button class="btn" type="submit">${bet ? "Oppdater" : "Lagre"}</button>`}
    </form>
  `;

  // Toggle-knapper for boolean
  area.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const k = btn.dataset.toggle;
      const v = btn.dataset.val;
      area.querySelectorAll(`[data-toggle="${k}"]`).forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(k).value = v;
    });
  });

  if (locked) return;

  document.getElementById("t-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = { player_id: me.id, updated_at: new Date().toISOString() };
    for (const f of TOURNAMENT_FIELDS) {
      const el = document.getElementById(f.key);
      const raw = el.value;
      if (f.type === "number") payload[f.key] = raw === "" ? null : Number(raw);
      else if (f.type === "boolean") payload[f.key] = raw === "true" ? true : raw === "false" ? false : null;
      else payload[f.key] = raw.trim() || null;
    }
    const { error } = await supabase
      .from("tk_tournament_bets")
      .upsert(payload, { onConflict: "player_id" });
    if (error) showAlert("error", error.message);
    else {
      showAlert("success", "Turneringstipp lagret.");
      load();
    }
  });
}

function renderResult(result, bet) {
  const score = bet ? scoreTournamentBet(bet, result) : null;
  document.getElementById("result-area").innerHTML = `
    <h2>Resultat</h2>
    <div class="card">
      ${TOURNAMENT_FIELDS.map((f) => `
        <div class="pts-row">
          <span class="label">${f.label}</span>
          <span>${escapeHtml(result[f.key] === true ? "Ja" : result[f.key] === false ? "Nei" : (result[f.key] ?? "—"))}</span>
        </div>`).join("")}
      ${score ? `
        <hr style="border:none; border-top:1px solid var(--border); margin:10px 0;">
        <div class="pts-row"><span class="label">Dine poeng</span><strong>${score.total}</strong></div>
      ` : ""}
    </div>
  `;
}

load();
