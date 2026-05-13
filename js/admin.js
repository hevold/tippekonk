// Admin: legge inn resultater, slette spillere, nullstille PIN.
import { requireAuth, clearSession } from "./auth.js";
import { supabase } from "./client.js";
import { getMatches, formatKickoff, clearCache } from "./football.js";
import { TOURNAMENT_FIELDS, MATCH_FIELDS } from "./scoring.js";

const me = requireAuth();
if (!me) throw new Error("no auth");

if (!me.is_admin) {
  window.location.href = "dashboard.html";
  throw new Error("not admin");
}

document.getElementById("hello").textContent = "Hei, " + me.name;
document.getElementById("logout").addEventListener("click", () => {
  clearSession();
  window.location.href = "index.html";
});

const tabs = document.querySelectorAll(".tabs button");
tabs.forEach((b) =>
  b.addEventListener("click", () => {
    tabs.forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    document.querySelectorAll("section").forEach((s) => s.classList.add("hidden"));
    document.getElementById("section-" + b.dataset.section).classList.remove("hidden");
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

function showAlert(type, msg) {
  document.getElementById("alert-area").innerHTML =
    `<div class="alert alert-${type}">${escapeHtml(msg)}</div>`;
  setTimeout(() => { document.getElementById("alert-area").innerHTML = ""; }, 4000);
}

// ============ Kamper ============
async function renderMatches() {
  const sec = document.getElementById("section-matches");
  sec.innerHTML = `<p><span class="spinner"></span> Laster kamper…</p>`;
  let matches;
  try {
    matches = await getMatches();
  } catch (err) {
    sec.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    return;
  }
  const { data: results } = await supabase.from("tk_match_results").select("*");
  const resultByMatch = new Map((results || []).map((r) => [r.match_id, r]));

  matches.sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate));

  sec.innerHTML = `
    <div class="btn-row mb-2">
      <button id="refresh" class="btn btn-secondary" type="button">Tøm football-cache</button>
    </div>
    <div class="match-list" id="adm-match-list">
      ${matches.map((m) => {
        const r = resultByMatch.get(m.id);
        const fs = m.score?.fullTime;
        return `
          <details>
            <summary class="match-row" style="display:block;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div class="teams">${escapeHtml(m.homeTeam.name)} – ${escapeHtml(m.awayTeam.name)}</div>
                  <div class="muted" style="font-size:0.82rem;">${formatKickoff(m.utcDate)} · ${escapeHtml(m.status)}</div>
                </div>
                <span class="status ${r ? "status-done" : (m.status === "FINISHED" ? "status-live" : "status-open")}">${r ? "Lagt inn" : (m.status === "FINISHED" ? "Mangler" : "Venter")}</span>
              </div>
            </summary>
            <form class="form-body card" data-match-id="${m.id}" style="margin-top:8px;">
              <div class="field-row">
                <div class="field">
                  <label>Hjemme mål</label>
                  <input name="home_goals" type="number" min="0" value="${r?.home_goals ?? fs?.home ?? ""}" />
                </div>
                <div class="field">
                  <label>Borte mål</label>
                  <input name="away_goals" type="number" min="0" value="${r?.away_goals ?? fs?.away ?? ""}" />
                </div>
              </div>
              <div class="field">
                <label>Første målscorer</label>
                <input name="first_scorer" type="text" value="${escapeHtml(r?.first_scorer ?? "")}" />
              </div>
              <div class="field-row">
                <div class="field">
                  <label>Gule hjemme</label>
                  <input name="home_yellow" type="number" min="0" value="${r?.home_yellow ?? ""}" />
                </div>
                <div class="field">
                  <label>Gule borte</label>
                  <input name="away_yellow" type="number" min="0" value="${r?.away_yellow ?? ""}" />
                </div>
              </div>
              <div class="field-row">
                <div class="field">
                  <label>Røde hjemme</label>
                  <input name="home_red" type="number" min="0" value="${r?.home_red ?? ""}" />
                </div>
                <div class="field">
                  <label>Røde borte</label>
                  <input name="away_red" type="number" min="0" value="${r?.away_red ?? ""}" />
                </div>
              </div>
              <button class="btn" type="submit">Lagre resultat</button>
            </form>
          </details>`;
      }).join("")}
    </div>
  `;

  document.getElementById("refresh").addEventListener("click", () => {
    clearCache();
    renderMatches();
  });

  sec.querySelectorAll("form[data-match-id]").forEach((f) => {
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const mid = Number(f.dataset.matchId);
      const fd = new FormData(f);
      const payload = { match_id: mid };
      for (const key of ["home_goals", "away_goals", "home_yellow", "away_yellow", "home_red", "away_red"]) {
        const v = fd.get(key);
        payload[key] = v === "" || v === null ? null : Number(v);
      }
      const fs = fd.get("first_scorer");
      payload.first_scorer = fs && fs.toString().trim() ? fs.toString().trim() : null;

      const { error } = await supabase
        .from("tk_match_results")
        .upsert(payload, { onConflict: "match_id" });
      if (error) showAlert("error", error.message);
      else showAlert("success", "Resultat lagret.");
    });
  });
}

// ============ Turnering ============
async function renderTournament() {
  const sec = document.getElementById("section-tournament");
  const { data } = await supabase.from("tk_tournament_results").select("*").limit(1).maybeSingle();
  const cur = data || {};

  sec.innerHTML = `
    <form id="t-form" class="form-body card">
      ${TOURNAMENT_FIELDS.map((f) => {
        const v = cur[f.key];
        if (f.type === "boolean") {
          return `
            <div class="field">
              <label>${f.label}</label>
              <select name="${f.key}">
                <option value="">—</option>
                <option value="true" ${v === true ? "selected" : ""}>Ja</option>
                <option value="false" ${v === false ? "selected" : ""}>Nei</option>
              </select>
            </div>`;
        }
        if (f.type === "number") {
          return `
            <div class="field">
              <label>${f.label}</label>
              <input name="${f.key}" type="number" value="${v ?? ""}" />
            </div>`;
        }
        return `
          <div class="field">
            <label>${f.label}</label>
            <input name="${f.key}" type="text" value="${escapeHtml(v ?? "")}" />
          </div>`;
      }).join("")}
      <button class="btn" type="submit">Lagre turneringsresultat</button>
    </form>
  `;

  document.getElementById("t-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {};
    for (const f of TOURNAMENT_FIELDS) {
      const v = fd.get(f.key);
      if (f.type === "boolean") payload[f.key] = v === "true" ? true : v === "false" ? false : null;
      else if (f.type === "number") payload[f.key] = v === "" || v === null ? null : Number(v);
      else payload[f.key] = v && v.toString().trim() ? v.toString().trim() : null;
    }
    // Single row table: enten oppdater eller insert
    if (data?.id) {
      const { error } = await supabase.from("tk_tournament_results").update(payload).eq("id", data.id);
      if (error) return showAlert("error", error.message);
    } else {
      const { error } = await supabase.from("tk_tournament_results").insert(payload);
      if (error) return showAlert("error", error.message);
    }
    showAlert("success", "Turneringsresultat lagret.");
    renderTournament();
  });
}

// ============ Spillere ============
async function renderPlayers() {
  const sec = document.getElementById("section-players");
  const { data: players, error } = await supabase
    .from("tk_players")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    sec.innerHTML = `<div class="alert alert-error">${escapeHtml(error.message)}</div>`;
    return;
  }

  sec.innerHTML = `
    <div class="card">
      <table class="lb-table">
        <thead>
          <tr><th>Navn</th><th>Admin</th><th></th></tr>
        </thead>
        <tbody>
          ${players.map((p) => `
            <tr>
              <td>${escapeHtml(p.name)}</td>
              <td>${p.is_admin ? "Ja" : ""}</td>
              <td>
                <button class="btn btn-secondary" data-toggle-admin="${p.id}" data-val="${!p.is_admin}">${p.is_admin ? "Fjern admin" : "Gjør admin"}</button>
                ${p.id !== me.id ? `<button class="btn btn-danger" data-delete="${p.id}" data-name="${escapeHtml(p.name)}">Slett</button>` : ""}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <p class="muted">Du kan ikke slette deg selv. PIN-nullstilling gjøres i Supabase SQL.</p>
  `;

  sec.querySelectorAll("[data-toggle-admin]").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.dataset.toggleAdmin;
      const val = b.dataset.val === "true";
      const { error } = await supabase.from("tk_players").update({ is_admin: val }).eq("id", id);
      if (error) showAlert("error", error.message);
      else { showAlert("success", "Oppdatert."); renderPlayers(); }
    });
  });
  sec.querySelectorAll("[data-delete]").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.dataset.delete;
      const name = b.dataset.name;
      if (!confirm(`Slette ${name} og alle deres tipp?`)) return;
      const { error } = await supabase.from("tk_players").delete().eq("id", id);
      if (error) showAlert("error", error.message);
      else { showAlert("success", "Slettet."); renderPlayers(); }
    });
  });
}

renderMatches();
renderTournament();
renderPlayers();
