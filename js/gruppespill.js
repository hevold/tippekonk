// Gruppespill: alle 72 kamper på én side, vertikal team-layout, +/- knapper, batch-lagring.
import { requireAuth, clearSession } from "./auth.js";
import { supabase } from "./client.js";
import { getMatches, formatKickoff, isOpenForBetting } from "./football.js";
import { teamNo } from "./teams-no.js";

const me = requireAuth();
if (!me) throw new Error("no auth");

document.getElementById("hello").textContent = "Hei, " + me.name;
document.getElementById("logout").addEventListener("click", () => {
  clearSession();
  window.location.href = "index.html";
});
if (me.is_admin) document.getElementById("admin-link").classList.remove("hidden");

// state: matchId -> { home_goals, away_goals, original, locked, match }
const state = new Map();

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function showAlert(type, msg) {
  document.getElementById("alert-area").innerHTML =
    `<div class="alert alert-${type}">${escapeHtml(msg)}</div>`;
  setTimeout(() => {
    if (document.getElementById("alert-area").innerHTML.includes(msg)) {
      document.getElementById("alert-area").innerHTML = "";
    }
  }, 4000);
}

function isDirty(s) {
  return s.home_goals !== s.original.home_goals || s.away_goals !== s.original.away_goals;
}

function dirtyCount() {
  let n = 0;
  for (const s of state.values()) if (isDirty(s)) n++;
  return n;
}

function updateSaveBar() {
  const n = dirtyCount();
  const bar = document.getElementById("savebar");
  const txt = document.getElementById("status-text");
  const btn = document.getElementById("save-btn");
  bar.classList.remove("hidden");
  if (n === 0) {
    txt.textContent = "Ingen endringer";
    txt.classList.remove("dirty");
    btn.disabled = true;
  } else {
    txt.textContent = n === 1 ? "1 endring ulagret" : `${n} endringer ulagret`;
    txt.classList.add("dirty");
    btn.disabled = false;
  }
}

function step(matchId, field, delta) {
  const s = state.get(matchId);
  if (!s || s.locked) return;
  const cur = s[field] ?? 0;
  const next = Math.max(0, cur + delta);
  if (next === cur) return;
  s[field] = next;
  renderMatch(matchId);
  updateSaveBar();
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("nb-NO", {
    weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function fmtTimeShort(iso) {
  const d = new Date(iso);
  return d.toLocaleString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

function fmtDayShort(iso) {
  const d = new Date(iso);
  return d.toLocaleString("nb-NO", { weekday: "short", day: "2-digit", month: "short" });
}

function renderMatch(matchId) {
  const el = document.querySelector(`[data-match-id="${matchId}"]`);
  if (!el) return;
  const s = state.get(matchId);
  el.classList.toggle("changed", isDirty(s));

  const valHome = el.querySelector(".val-home");
  const valAway = el.querySelector(".val-away");
  valHome.textContent = s.home_goals ?? "—";
  valAway.textContent = s.away_goals ?? "—";
  valHome.classList.toggle("empty", s.home_goals === null || s.home_goals === undefined);
  valAway.classList.toggle("empty", s.away_goals === null || s.away_goals === undefined);

  el.querySelector(".dec-home").disabled = !s.home_goals;
  el.querySelector(".dec-away").disabled = !s.away_goals;
}

function teamRow(team, side, s, locked) {
  const flag = team.crest ? `<img class="flag" src="${team.crest}" alt="" />` : "";
  const name = teamNo(team);
  const val = s[`${side}_goals`];
  const empty = val === null || val === undefined;
  const open = !locked;
  return `
    <div class="gs-team-row">
      <span class="time"></span>
      <div class="team">${flag}<span class="name">${escapeHtml(name)}</span></div>
      <div class="gs-stepper" role="group">
        <button type="button" class="gs-step-btn dec-${side}" data-action="dec-${side}" ${open ? "" : "disabled"} aria-label="Trekk fra mål">−</button>
        <span class="gs-step-val val-${side}${empty ? " empty" : ""}">${val ?? "—"}</span>
        <button type="button" class="gs-step-btn inc-${side}" data-action="inc-${side}" ${open ? "" : "disabled"} aria-label="Legg til mål">+</button>
      </div>
    </div>
  `;
}

function matchHtml(m) {
  const s = state.get(m.id);
  return `
    <div class="gs-match${s.locked ? " locked" : ""}" data-match-id="${m.id}">
      <div class="gs-match-meta">${fmtTime(m.utcDate)}${s.locked ? " · stengt" : ""}</div>
      ${teamRow(m.homeTeam, "home", s, s.locked).replace(
        '<span class="time"></span>',
        `<span class="time">${fmtTimeShort(m.utcDate)}</span>`
      )}
      ${teamRow(m.awayTeam, "away", s, s.locked)}
    </div>
  `;
}

async function load() {
  let matches;
  try {
    matches = await getMatches();
  } catch (err) {
    document.getElementById("groups-area").innerHTML =
      `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    return;
  }

  const group = matches
    .filter((m) => m.stage === "GROUP_STAGE")
    .sort((a, b) => {
      if (a.group !== b.group) return (a.group || "").localeCompare(b.group || "");
      return new Date(a.utcDate) - new Date(b.utcDate);
    });

  const { data: myBets } = await supabase
    .from("tk_match_bets")
    .select("*")
    .eq("player_id", me.id)
    .in("match_id", group.map((m) => m.id));

  const betByMatch = new Map((myBets || []).map((b) => [b.match_id, b]));

  for (const m of group) {
    const b = betByMatch.get(m.id);
    state.set(m.id, {
      match: m,
      home_goals: b?.home_goals ?? null,
      away_goals: b?.away_goals ?? null,
      original: {
        home_goals: b?.home_goals ?? null,
        away_goals: b?.away_goals ?? null,
      },
      locked: !isOpenForBetting(m),
      existing: !!b,
    });
  }

  const byGroup = new Map();
  for (const m of group) {
    const g = m.group || "GROUP_?";
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(m);
  }

  const area = document.getElementById("groups-area");
  area.innerHTML = Array.from(byGroup.entries())
    .map(([g, ms]) => {
      const tipped = ms.filter((m) => {
        const s = state.get(m.id);
        return s.home_goals !== null && s.away_goals !== null;
      }).length;
      return `
        <section class="gs-group">
          <header class="gs-group-head">
            <span>Gruppe ${g.replace("GROUP_", "")}</span>
            <span class="meta">${tipped}/${ms.length} tippet</span>
          </header>
          ${ms.map(matchHtml).join("")}
        </section>
      `;
    }).join("");

  area.addEventListener("click", (e) => {
    const btn = e.target.closest(".gs-step-btn");
    if (!btn) return;
    const m = btn.closest("[data-match-id]");
    const id = Number(m.dataset.matchId);
    const action = btn.dataset.action;
    if (action === "inc-home") step(id, "home_goals", +1);
    else if (action === "dec-home") step(id, "home_goals", -1);
    else if (action === "inc-away") step(id, "away_goals", +1);
    else if (action === "dec-away") step(id, "away_goals", -1);
  });

  updateSaveBar();
}

function autofill(value) {
  let n = 0;
  for (const [id, s] of state) {
    if (s.locked) continue;
    if (s.home_goals === null || s.home_goals === undefined) {
      s.home_goals = value;
      n++;
    }
    if (s.away_goals === null || s.away_goals === undefined) {
      s.away_goals = value;
    }
    if (n > 0) renderMatch(id);
  }
  // Re-render group counts
  for (const head of document.querySelectorAll(".gs-group-head .meta")) {
    const section = head.closest(".gs-group");
    const matches = section.querySelectorAll(".gs-match");
    let tipped = 0;
    matches.forEach((el) => {
      const s = state.get(Number(el.dataset.matchId));
      if (s.home_goals !== null && s.away_goals !== null) tipped++;
    });
    head.textContent = `${tipped}/${matches.length} tippet`;
  }
  updateSaveBar();
  if (n) showAlert("info", `Fylte ut ${n} blanke kamper med ${value}–${value}.`);
}

async function save() {
  const dirty = [];
  for (const [matchId, s] of state) {
    if (!isDirty(s) || s.locked) continue;
    dirty.push({
      player_id: me.id,
      match_id: matchId,
      home_goals: s.home_goals,
      away_goals: s.away_goals,
      updated_at: new Date().toISOString(),
    });
  }
  if (!dirty.length) return;

  const btn = document.getElementById("save-btn");
  btn.disabled = true;
  btn.textContent = "Lagrer…";

  const { error } = await supabase
    .from("tk_match_bets")
    .upsert(dirty, { onConflict: "player_id,match_id" });

  if (error) {
    showAlert("error", error.message);
    btn.disabled = false;
    btn.textContent = "Lagre tipp";
    return;
  }

  for (const row of dirty) {
    const s = state.get(row.match_id);
    if (s) {
      s.original.home_goals = row.home_goals;
      s.original.away_goals = row.away_goals;
      s.existing = true;
      renderMatch(row.match_id);
    }
  }

  btn.textContent = "Lagre tipp";
  updateSaveBar();
  showAlert("success", `Lagret ${dirty.length} tipp.`);
}

document.getElementById("save-btn").addEventListener("click", save);
document.getElementById("autofill-1").addEventListener("click", () => autofill(1));
document.getElementById("autofill-0").addEventListener("click", () => autofill(0));

load();
