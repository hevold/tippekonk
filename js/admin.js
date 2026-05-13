// Admin: legge inn resultater, slette spillere, nullstille PIN.
import { requireAuth, clearSession, updateInviteCode } from "./auth.js";
import { supabase } from "./client.js";
import { getMatches, formatKickoff, clearCache, manualSync } from "./football.js";
import { teamNo } from "./teams-no.js";
import { TOURNAMENT_FIELDS, MATCH_FIELDS, scoreMatchBet, scoreTournamentBet, buildLeaderboard } from "./scoring.js";

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
      <button id="sync-now" class="btn" type="button">Sync resultater nå</button>
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
                  <div class="teams">${escapeHtml(teamNo(m.homeTeam))} – ${escapeHtml(teamNo(m.awayTeam))}</div>
                  <div class="muted" style="font-size:0.82rem;">${formatKickoff(m.utcDate)} · ${escapeHtml(m.status)}${m.group ? " · gruppe " + m.group.replace("GROUP_", "") : ""}</div>
                </div>
                <span class="status ${r ? "status-done" : (m.status === "FINISHED" ? "status-live" : "status-open")}">${r ? "Lagt inn" : (m.status === "FINISHED" ? "Mangler" : "Venter")}</span>
              </div>
            </summary>
            <form class="form-body card" data-match-id="${m.id}" data-stage="${escapeHtml(m.stage)}" style="margin-top:8px;">
              <div class="field-row">
                <div class="field">
                  <label>Hjemme mål${m.stage !== "GROUP_STAGE" ? " (90 min)" : ""}</label>
                  <input name="home_goals" type="number" min="0" value="${r?.home_goals ?? fs?.home ?? ""}" />
                </div>
                <div class="field">
                  <label>Borte mål${m.stage !== "GROUP_STAGE" ? " (90 min)" : ""}</label>
                  <input name="away_goals" type="number" min="0" value="${r?.away_goals ?? fs?.away ?? ""}" />
                </div>
              </div>
              ${m.stage !== "GROUP_STAGE" ? `
              <div class="field">
                <label>Hvem gikk videre</label>
                <select name="winner">
                  <option value="">—</option>
                  <option value="HOME" ${r?.winner === "HOME" ? "selected" : ""}>Hjemme</option>
                  <option value="AWAY" ${r?.winner === "AWAY" ? "selected" : ""}>Borte</option>
                </select>
              </div>` : ""}
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

  document.getElementById("sync-now").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Synker…";
    const res = await manualSync();
    btn.disabled = false;
    btn.textContent = "Sync resultater nå";
    if (!res) {
      showAlert("warning", "Synket nylig — vent et øyeblikk før neste sync.");
      return;
    }
    if (res.error) {
      showAlert("error", "Sync feilet: " + res.error);
      return;
    }
    showAlert("success", `Oppdaterte ${res.updated} resultater (${res.total_finished} ferdige kamper totalt).`);
    if (res.updated > 0) {
      clearCache();
      renderMatches();
    }
  });

  sec.querySelectorAll("form[data-match-id]").forEach((f) => {
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const mid = Number(f.dataset.matchId);
      const fd = new FormData(f);
      const payload = { match_id: mid };
      for (const key of ["home_goals", "away_goals"]) {
        const v = fd.get(key);
        payload[key] = v === "" || v === null ? null : Number(v);
      }
      const w = fd.get("winner");
      if (w !== null) payload.winner = w || null;

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

// ============ Innstillinger ============
async function renderSettings() {
  const sec = document.getElementById("section-settings");
  sec.innerHTML = `
    <div class="card">
      <h3 class="mt-0 mb-1">Backup / eksport</h3>
      <p class="muted">Last ned alt av tippinger, resultater og stilling som Excel-fil. Bra som plan B hvis appen ryker, eller for å regne poeng manuelt.</p>
      <button class="btn" id="export-xlsx" type="button">Last ned Excel-backup</button>
    </div>

    <div class="card">
      <h3 class="mt-0 mb-1">Invitasjonskode</h3>
      <p class="muted">Nye brukere må skrive inn denne koden for å registrere seg. Koden lagres som SHA-256-hash i Supabase. Nåværende kode kan ikke leses fra DB — du må enten huske den eller sette en ny her.</p>
      <form id="invite-form" class="form-body" autocomplete="off">
        <div class="field">
          <label for="new-code">Ny invitasjonskode (minst 4 tegn)</label>
          <input id="new-code" type="text" autocapitalize="off" required minlength="4" />
        </div>
        <button class="btn" type="submit">Oppdater kode</button>
      </form>
    </div>
  `;
  document.getElementById("invite-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const newCode = document.getElementById("new-code").value;
    try {
      await updateInviteCode(newCode);
      showAlert("success", "Invitasjonskode oppdatert. Del den nye koden med vennene dine.");
      document.getElementById("new-code").value = "";
    } catch (err) {
      showAlert("error", err.message || "Kunne ikke oppdatere kode");
    }
  });

  document.getElementById("export-xlsx").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Henter data…";
    try {
      await exportToExcel();
      showAlert("success", "Excel-fil lastet ned.");
    } catch (err) {
      showAlert("error", "Eksport feilet: " + err.message);
    }
    btn.disabled = false;
    btn.textContent = "Last ned Excel-backup";
  });
}

async function exportToExcel() {
  if (!window.XLSX) throw new Error("XLSX-biblioteket lastet ikke");

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

  // 1. Stilling
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

  // 2. Kamp-tipp (alle spillere, alle kamper)
  const matchBetsRows = (matchBets.data || []).map((b) => {
    const m = matchById.get(b.match_id);
    const p = playerById.get(b.player_id);
    const r = resultByMatch.get(b.match_id);
    const score = r ? scoreMatchBet(b, r) : { total: null, breakdown: [] };
    const stageNo = {
      GROUP_STAGE: "Gruppespill",
      LAST_32: "Sekstendelsfinale",
      LAST_16: "Åttendedelsfinale",
      QUARTER_FINALS: "Kvartfinale",
      SEMI_FINALS: "Semifinale",
      THIRD_PLACE: "Bronsefinale",
      FINAL: "Finale",
    };
    return {
      "Spiller": p?.name || "?",
      "Match-ID": b.match_id,
      "Runde": stageNo[m?.stage] || m?.stage || "?",
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
      "Status": m?.status || "?",
    };
  });
  // Sorter: spiller → runde → dato
  matchBetsRows.sort((a, b) => {
    if (a.Spiller !== b.Spiller) return a.Spiller.localeCompare(b.Spiller);
    if (a["Match-ID"] !== b["Match-ID"]) return a["Match-ID"] - b["Match-ID"];
    return 0;
  });

  // 3. Turnerings-tipp
  const tournamentRows = (tournamentBets.data || []).map((b) => {
    const p = playerById.get(b.player_id);
    const score = tournamentResult.data ? scoreTournamentBet(b, tournamentResult.data) : { total: null };
    const row = { "Spiller": p?.name || "?" };
    for (const f of TOURNAMENT_FIELDS) {
      row[f.label] = b[f.key] === null || b[f.key] === undefined ? "" :
                     typeof b[f.key] === "boolean" ? (b[f.key] ? "Ja" : "Nei") : b[f.key];
    }
    row["Poeng"] = score.total ?? "";
    return row;
  });

  // 4. Resultater
  const resultsRows = (matchResults.data || []).map((r) => {
    const m = matchById.get(r.match_id);
    return {
      "Match-ID": r.match_id,
      "Dato": m ? new Date(m.utcDate).toLocaleString("nb-NO") : "",
      "Hjemmelag": m ? teamNo(m.homeTeam) : "?",
      "Bortelag": m ? teamNo(m.awayTeam) : "?",
      "Hjemme mål": r.home_goals,
      "Borte mål": r.away_goals,
      "Vinner": r.winner || "",
      "Status": m?.status || "?",
    };
  });

  // 5. Spillere
  const playerRows = (players.data || []).map((p) => ({
    "Navn": p.name,
    "Admin": p.is_admin ? "Ja" : "Nei",
    "Registrert": new Date(p.created_at).toLocaleString("nb-NO"),
  }));

  // Bygg workbook
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
  window.XLSX.writeFile(wb, `tippekonk-${stamp}.xlsx`);
}

renderMatches();
renderTournament();
renderPlayers();
renderSettings();
