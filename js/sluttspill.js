// Sluttspill: bygger bracket fra brukerens grupp-bets + cascading winners.
import { requireAuth, clearSession } from "./auth.js";
import { supabase } from "./client.js";
import { getMatches, isOpenForBetting } from "./football.js";
import { teamNo } from "./teams-no.js";
import { computeGroupStandings, computeQualifiers, seedQualifiers } from "./standings.js";
import {
  buildLast32, buildLast16, buildQuarters, buildSemis, buildFinal, buildThirdPlace, ROUND_LABEL,
} from "./bracket.js";

const me = requireAuth();
if (!me) throw new Error("no auth");

document.getElementById("hello").textContent = "Hei, " + me.name;
document.getElementById("logout").addEventListener("click", () => {
  clearSession();
  window.location.href = "index.html";
});
if (me.is_admin) document.getElementById("admin-link").classList.remove("hidden");

// state: bracketSlotId ('L32-1' osv.) -> { home_goals, away_goals, winner, original, locked, fdMatchId, match }
const state = new Map();
// fdMatchId -> bracketSlotId (for upsert)
const fdToSlot = new Map();
// rounds rendered (cached per render)
let allRounds = null;

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
  return s.home_goals !== s.original.home_goals ||
         s.away_goals !== s.original.away_goals ||
         s.winner !== s.original.winner;
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

function fmtTimeShort(iso) {
  const d = new Date(iso);
  return d.toLocaleString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

function fmtFull(iso) {
  const d = new Date(iso);
  return d.toLocaleString("nb-NO", {
    weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function teamCell(team, isPlaceholder, slot, side) {
  if (isPlaceholder || !team) {
    const placeholder = side === "home"
      ? "Vinner forrige runde"
      : "Vinner forrige runde";
    return `<div class="team tbd"><span class="name">${escapeHtml(placeholder)}</span></div>`;
  }
  const flag = team.crest ? `<img class="flag" src="${team.crest}" alt="" />` : "";
  return `<div class="team">${flag}<span class="name">${escapeHtml(teamNo(team))}</span></div>`;
}

function step(slotId, field, delta) {
  const s = state.get(slotId);
  if (!s || s.locked) return;
  const cur = s[field] ?? 0;
  const next = Math.max(0, cur + delta);
  if (next === cur) return;
  s[field] = next;
  // Auto-update winner from goals if not draw
  if (s.home_goals !== null && s.away_goals !== null && s.home_goals !== s.away_goals) {
    s.winner = s.home_goals > s.away_goals ? "HOME" : "AWAY";
  }
  rerenderAll();
  updateSaveBar();
}

function pickWinner(slotId, w) {
  const s = state.get(slotId);
  if (!s || s.locked) return;
  s.winner = w;
  rerenderAll();
  updateSaveBar();
}

function bracketRow(b, side, s, isPlaceholder, time) {
  const team = side === "home" ? b.home : b.away;
  const val = s[`${side}_goals`];
  const empty = val === null || val === undefined;
  const open = !s.locked && !isPlaceholder && team;
  return `
    <div class="gs-team-row">
      <span class="time">${time || ""}</span>
      ${teamCell(team, isPlaceholder, b.slot, side)}
      <div class="gs-stepper" role="group">
        <button type="button" class="gs-step-btn dec-${side}" data-action="dec-${side}" ${open ? "" : "disabled"} aria-label="Trekk fra mål">−</button>
        <span class="gs-step-val val-${side}${empty ? " empty" : ""}">${val ?? "—"}</span>
        <button type="button" class="gs-step-btn inc-${side}" data-action="inc-${side}" ${open ? "" : "disabled"} aria-label="Legg til mål">+</button>
      </div>
    </div>
  `;
}

function bracketMatch(b) {
  const s = state.get(b.id);
  const homeOK = !!b.home;
  const awayOK = !!b.away;
  const time = s.match ? fmtTimeShort(s.match.utcDate) : "";
  const meta = s.match ? fmtFull(s.match.utcDate) : "Tid ikke satt";
  const noTeams = !homeOK && !awayOK;
  return `
    <div class="gs-match${s.locked ? " locked" : ""}${isDirty(s) ? " changed" : ""}" data-slot-id="${b.id}">
      <div class="gs-match-meta">${escapeHtml(meta)}${s.locked ? " · stengt" : ""}</div>
      ${bracketRow(b, "home", s, !homeOK, time)}
      ${bracketRow(b, "away", s, !awayOK, "")}
      <div class="gs-winner-row">
        <span class="label">Videre:</span>
        <div class="gs-winner">
          <button type="button" data-pick="HOME" class="${s.winner === "HOME" ? "active" : ""}" ${homeOK && !s.locked ? "" : "disabled"}>${homeOK ? escapeHtml(teamNo(b.home)) : "Hjemme"}</button>
          <button type="button" data-pick="AWAY" class="${s.winner === "AWAY" ? "active" : ""}" ${awayOK && !s.locked ? "" : "disabled"}>${awayOK ? escapeHtml(teamNo(b.away)) : "Borte"}</button>
        </div>
      </div>
    </div>
  `;
}

function roundSection(name, matches, complete) {
  const tipped = matches.filter((b) => {
    const s = state.get(b.id);
    return s.winner !== null && s.home_goals !== null && s.away_goals !== null;
  }).length;
  return `
    <section class="gs-group">
      <header class="gs-group-head">
        <span>${escapeHtml(name)}</span>
        <span class="meta">${tipped}/${matches.length} tippet</span>
      </header>
      ${matches.map(bracketMatch).join("")}
    </section>
  `;
}

function rerenderAll() {
  if (!allRounds) return;
  // Vinnere fra forrige runder cascader
  const pickWinners = (round) => round.map((b) => {
    const s = state.get(b.id);
    return { matchId: b.id, winner: s.winner };
  }).filter((w) => w.winner);

  // Bygg om L16, QF, SF, Final, Bronze fra current state
  const last32 = allRounds.last32;
  const last16 = buildLast16(last32, pickWinners(last32));
  const quarters = buildQuarters(last16, pickWinners(last16));
  const semis = buildSemis(quarters, pickWinners(quarters));
  const finalArr = buildFinal(semis, pickWinners(semis));
  const bronze = buildThirdPlace(semis, pickWinners(semis));

  // Tilordne slot-IDs til state (samme som ved init)
  assignSlotState(last16);
  assignSlotState(quarters);
  assignSlotState(semis);
  assignSlotState(finalArr);
  assignSlotState(bronze);

  allRounds.last16 = last16;
  allRounds.quarters = quarters;
  allRounds.semis = semis;
  allRounds.final = finalArr;
  allRounds.bronze = bronze;

  renderRounds();
}

// Sikrer at alle slots har en state-entry og oppdater home/away referanse
function assignSlotState(round) {
  for (const b of round) {
    if (!state.has(b.id)) {
      state.set(b.id, {
        home_goals: null, away_goals: null, winner: null,
        original: { home_goals: null, away_goals: null, winner: null },
        locked: false,
        match: null,
        fdMatchId: null,
      });
    }
    // Oppdater home/away referanse (kan endres når winners cascader)
    state.get(b.id).homeRef = b.home;
    state.get(b.id).awayRef = b.away;
  }
}

function renderRounds() {
  const area = document.getElementById("bracket-area");
  area.innerHTML = `
    ${roundSection(ROUND_LABEL.LAST_32, allRounds.last32)}
    ${roundSection(ROUND_LABEL.LAST_16, allRounds.last16)}
    ${roundSection(ROUND_LABEL.QUARTER_FINALS, allRounds.quarters)}
    ${roundSection(ROUND_LABEL.SEMI_FINALS, allRounds.semis)}
    ${roundSection(ROUND_LABEL.THIRD_PLACE, allRounds.bronze)}
    ${roundSection(ROUND_LABEL.FINAL, allRounds.final)}
  `;
}

async function load() {
  let matches;
  try {
    matches = await getMatches();
  } catch (err) {
    document.getElementById("bracket-area").innerHTML =
      `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    return;
  }

  const groupMatches = matches.filter((m) => m.stage === "GROUP_STAGE");
  const knockout = {
    LAST_32: matches.filter((m) => m.stage === "LAST_32").sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate)),
    LAST_16: matches.filter((m) => m.stage === "LAST_16").sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate)),
    QUARTER_FINALS: matches.filter((m) => m.stage === "QUARTER_FINALS").sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate)),
    SEMI_FINALS: matches.filter((m) => m.stage === "SEMI_FINALS").sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate)),
    THIRD_PLACE: matches.filter((m) => m.stage === "THIRD_PLACE"),
    FINAL: matches.filter((m) => m.stage === "FINAL"),
  };

  // Hent alle bets (gruppe + sluttspill)
  const allKnockoutIds = [
    ...knockout.LAST_32, ...knockout.LAST_16, ...knockout.QUARTER_FINALS,
    ...knockout.SEMI_FINALS, ...knockout.THIRD_PLACE, ...knockout.FINAL,
  ].map((m) => m.id);

  const { data: groupBets } = await supabase
    .from("tk_match_bets").select("*").eq("player_id", me.id)
    .in("match_id", groupMatches.map((m) => m.id));

  const { data: koBets } = await supabase
    .from("tk_match_bets").select("*").eq("player_id", me.id)
    .in("match_id", allKnockoutIds);

  // Beregn standings + kvalifiserte
  const standings = computeGroupStandings(groupMatches, groupBets || []);
  const { qualified, complete, gaps } = computeQualifiers(standings);

  if (!complete) {
    const gapList = gaps.map((g) => g.replace("GROUP_", "")).join(", ");
    document.getElementById("bracket-area").innerHTML = `
      <div class="alert alert-warning">
        Sluttspillet er låst inntil du har tippet alle 72 gruppekampene.
        ${gaps.length ? `Mangler tipp i gruppe: <strong>${escapeHtml(gapList)}</strong>.` : ""}
        <br /><a href="gruppespill.html">Gå til gruppespill →</a>
      </div>
    `;
    return;
  }

  // Seed og bygg første runde
  const seeded = seedQualifiers(qualified);
  const last32 = buildLast32(seeded);

  // Map bracket-slots til football-data match IDs (sortert på dato).
  // L32-1 → første LAST_32 kamp, L32-2 → andre, osv.
  const fdMatches = {
    LAST_32: knockout.LAST_32,
    LAST_16: knockout.LAST_16,
    QUARTER_FINALS: knockout.QUARTER_FINALS,
    SEMI_FINALS: knockout.SEMI_FINALS,
    THIRD_PLACE: knockout.THIRD_PLACE,
    FINAL: knockout.FINAL,
  };

  // Init state for L32 først (siden vi har faktiske matches)
  const koBetByMatch = new Map((koBets || []).map((b) => [b.match_id, b]));

  function initRoundState(round, fdRound) {
    for (let i = 0; i < round.length; i++) {
      const slot = round[i];
      const fd = fdRound[i];
      const fdId = fd?.id || null;
      const bet = fdId ? koBetByMatch.get(fdId) : null;
      const locked = fd ? !isOpenForBetting(fd) && fd.status !== "TIMED" && fd.status !== "SCHEDULED" : false;
      state.set(slot.id, {
        home_goals: bet?.home_goals ?? null,
        away_goals: bet?.away_goals ?? null,
        winner: bet?.winner ?? null,
        original: {
          home_goals: bet?.home_goals ?? null,
          away_goals: bet?.away_goals ?? null,
          winner: bet?.winner ?? null,
        },
        locked: !!locked,
        match: fd || null,
        fdMatchId: fdId,
        homeRef: slot.home,
        awayRef: slot.away,
      });
      if (fdId) fdToSlot.set(fdId, slot.id);
    }
  }

  initRoundState(last32, fdMatches.LAST_32);

  // Bygg resterende runder fra winners
  const pickWinners = (round) => round.map((b) => {
    const s = state.get(b.id);
    return { matchId: b.id, winner: s.winner };
  }).filter((w) => w.winner);

  const last16 = buildLast16(last32, pickWinners(last32));
  initRoundState(last16, fdMatches.LAST_16);

  const quarters = buildQuarters(last16, pickWinners(last16));
  initRoundState(quarters, fdMatches.QUARTER_FINALS);

  const semis = buildSemis(quarters, pickWinners(quarters));
  initRoundState(semis, fdMatches.SEMI_FINALS);

  const finalArr = buildFinal(semis, pickWinners(semis));
  initRoundState(finalArr, fdMatches.FINAL);

  const bronze = buildThirdPlace(semis, pickWinners(semis));
  initRoundState(bronze, fdMatches.THIRD_PLACE);

  allRounds = { last32, last16, quarters, semis, final: finalArr, bronze };
  renderRounds();

  const area = document.getElementById("bracket-area");
  area.addEventListener("click", (e) => {
    const stepBtn = e.target.closest(".gs-step-btn");
    if (stepBtn) {
      const m = stepBtn.closest("[data-slot-id]");
      const slotId = m.dataset.slotId;
      const action = stepBtn.dataset.action;
      if (action === "inc-home") step(slotId, "home_goals", +1);
      else if (action === "dec-home") step(slotId, "home_goals", -1);
      else if (action === "inc-away") step(slotId, "away_goals", +1);
      else if (action === "dec-away") step(slotId, "away_goals", -1);
      return;
    }
    const winBtn = e.target.closest(".gs-winner button[data-pick]");
    if (winBtn) {
      const m = winBtn.closest("[data-slot-id]");
      pickWinner(m.dataset.slotId, winBtn.dataset.pick);
    }
  });

  updateSaveBar();
}

async function save() {
  const dirty = [];
  for (const [slotId, s] of state) {
    if (!isDirty(s) || s.locked) continue;
    if (!s.fdMatchId) continue; // kan ikke lagre uten faktisk match-ID
    dirty.push({
      player_id: me.id,
      match_id: s.fdMatchId,
      home_goals: s.home_goals,
      away_goals: s.away_goals,
      winner: s.winner,
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

  // Oppdater original
  for (const row of dirty) {
    const slotId = fdToSlot.get(row.match_id);
    if (slotId) {
      const s = state.get(slotId);
      s.original.home_goals = row.home_goals;
      s.original.away_goals = row.away_goals;
      s.original.winner = row.winner;
    }
  }

  btn.textContent = "Lagre tipp";
  rerenderAll();
  updateSaveBar();
  showAlert("success", `Lagret ${dirty.length} tipp.`);
}

document.getElementById("save-btn").addEventListener("click", save);
document.getElementById("autofill-home").addEventListener("click", () => {
  let n = 0;
  for (const [id, s] of state) {
    if (s.locked) continue;
    if (s.home_goals === null) { s.home_goals = 1; n++; }
    if (s.away_goals === null) { s.away_goals = 0; }
    if (!s.winner) s.winner = "HOME";
  }
  if (n) showAlert("info", `Fylte ut ${n} blanke kamper med 1–0 hjemme.`);
  rerenderAll();
  updateSaveBar();
});

load();
