// Sluttspill: bygger sluttspilltreet fra de FAKTISKE football-data-kampene.
//
// 16-delsfinalen (R32) hentes rett fra football-datas LAST_32-kamper. For hver
// senere runde fylles slottet med laget som FAKTISK gikk videre (fra
// tk_match_results.winner), fortløpende etter hvert som kampene blir ferdige —
// ikke fra spillerens egne antakelser. Du tipper sluttresultat (etter ord. tid)
// på hver ekte kamp, og kan endre helt fram til avspark.
import { requireAuth, clearSession } from "./auth.js";
import { supabase } from "./client.js";
import { getMatches, isOpenForBetting } from "./football.js";
import { teamNo, teamTla } from "./teams-no.js";
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

// state: bracketSlotId ('M73' osv.) -> { home_goals, away_goals, original, locked, match, fdMatchId, advanced }
const state = new Map();
// fdMatchId -> bracketSlotId (for å oppdatere original etter lagring)
const fdToSlot = new Map();
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
         s.away_goals !== s.original.away_goals;
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

function teamCell(team, isPlaceholder) {
  if (isPlaceholder || !team) {
    return `<div class="team tbd"><span class="name">Vinner forrige runde</span></div>`;
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
  render();
  updateSaveBar();
}

function bracketRow(b, side, s, isPlaceholder, time) {
  const team = side === "home" ? b.home : b.away;
  const val = s[`${side}_goals`];
  const empty = val === null || val === undefined;
  // Uten fdMatchId kan tippet ikke lagres (save() krever ekte kamp-ID) —
  // da skal det heller ikke gå an å taste inn noe som stille forsvinner.
  const open = !s.locked && !isPlaceholder && team && s.fdMatchId;
  return `
    <div class="gs-team-row">
      <span class="time">${time || ""}</span>
      ${teamCell(team, isPlaceholder)}
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
  const meta = s.match
    ? fmtFull(s.match.utcDate)
    : (homeOK && awayOK ? "Venter på kampoppsett — kan ikke tippes ennå" : "Avventer forrige runde");
  return `
    <div class="gs-match${s.locked ? " locked" : ""}${isDirty(s) ? " changed" : ""}" data-slot-id="${b.id}">
      <div class="gs-match-meta">${escapeHtml(meta)}${s.locked ? " · stengt" : ""}</div>
      ${bracketRow(b, "home", s, !homeOK, time)}
      ${bracketRow(b, "away", s, !awayOK, "")}
    </div>
  `;
}

function roundSection(name, matches) {
  const tipped = matches.filter((b) => {
    const s = state.get(b.id);
    return s.home_goals !== null && s.away_goals !== null;
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

function render() {
  if (!allRounds) return;
  renderList();
  renderBracket();
}

function renderList() {
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

// ============ Bracket-visualisering ============
function bracketTeamRow(team, side, s, isWinner, isLoser) {
  const isTbd = !team;
  const flag = team?.crest ? `<img class="flag" src="${team.crest}" alt="" />` : "";
  const name = team ? teamNo(team) : "Avgjøres";
  const goals = s[`${side}_goals`];
  const cls = isWinner ? "winner" : isLoser ? "loser" : "";
  return `
    <div class="bracket-team ${cls}${isTbd ? " tbd" : ""}">
      ${flag}<span class="name">${escapeHtml(name)}</span>
      <span class="goals">${goals ?? ""}</span>
    </div>
  `;
}

function bracketMatchHtml(b, y) {
  const s = state.get(b.id);
  if (!s) return "";
  // Highlight laget som faktisk gikk videre (fra resultatet), ikke et tips.
  const homeWin = s.advanced === "HOME";
  const awayWin = s.advanced === "AWAY";
  return `
    <div class="bracket-match${isDirty(s) ? " dirty" : ""}" style="top:${y}px;" data-slot-id="${b.id}">
      ${bracketTeamRow(b.home, "home", s, homeWin, awayWin)}
      <div class="bracket-separator"></div>
      ${bracketTeamRow(b.away, "away", s, awayWin, homeWin)}
    </div>
  `;
}

function renderBracket() {
  const area = document.getElementById("bracket-svg-area");
  if (!allRounds) { area.innerHTML = ""; return; }

  const matchH = 64;
  const gap = 8;
  const slotH = matchH + gap;
  const totalH = 16 * slotH;

  // Posisjoner: L32 i fast rytme, deretter midtpunkt mellom kilder.
  const yPos = {};
  allRounds.last32.forEach((m, i) => { yPos[m.id] = i * slotH; });
  for (const round of [allRounds.last16, allRounds.quarters, allRounds.semis, allRounds.final]) {
    for (const m of round) {
      const s1 = yPos[m.sourceMatches?.[0]];
      const s2 = yPos[m.sourceMatches?.[1]];
      yPos[m.id] = (s1 !== undefined && s2 !== undefined) ? (s1 + s2) / 2 : 0;
    }
  }

  const colW = 170 + 16; // col-bredde + gap
  const paths = [];
  function addConnector(srcRound, dstRound, colIdx) {
    for (const dst of dstRound) {
      const dstY = yPos[dst.id] + matchH / 2;
      const dstX = colIdx * colW;
      for (const srcId of dst.sourceMatches || []) {
        const srcY = yPos[srcId] + matchH / 2;
        const srcX = colIdx * colW - 16;
        const midX = srcX + 8;
        paths.push(`M ${srcX} ${srcY} L ${midX} ${srcY} L ${midX} ${dstY} L ${dstX} ${dstY}`);
      }
    }
  }
  addConnector(allRounds.last32, allRounds.last16, 1);
  addConnector(allRounds.last16, allRounds.quarters, 2);
  addConnector(allRounds.quarters, allRounds.semis, 3);
  addConnector(allRounds.semis, allRounds.final, 4);

  const totalW = 5 * 170 + 4 * 16;

  const colLabels = [
    "Åttendedel · 16",
    "8-del · 8",
    "Kvart · 4",
    "Semi · 2",
    "Finale",
  ];

  area.innerHTML = `
    <div class="bracket-scroll">
      <div style="display:flex; gap:16px; padding-bottom:6px;">
        ${colLabels.map((l) => `<div class="bracket-col-header" style="width:170px;">${escapeHtml(l)}</div>`).join("")}
      </div>
      <div class="bracket" style="height:${totalH}px;">
        <svg class="bracket-connector" width="${totalW}" height="${totalH}" style="position:absolute; top:0; left:0; pointer-events:none;">
          ${paths.map((p) => `<path d="${p}" />`).join("")}
        </svg>
        <div class="bracket-col">
          ${allRounds.last32.map((b) => bracketMatchHtml(b, yPos[b.id])).join("")}
        </div>
        <div class="bracket-col">
          ${allRounds.last16.map((b) => bracketMatchHtml(b, yPos[b.id])).join("")}
        </div>
        <div class="bracket-col">
          ${allRounds.quarters.map((b) => bracketMatchHtml(b, yPos[b.id])).join("")}
        </div>
        <div class="bracket-col">
          ${allRounds.semis.map((b) => bracketMatchHtml(b, yPos[b.id])).join("")}
        </div>
        <div class="bracket-col">
          ${allRounds.final.map((b) => bracketMatchHtml(b, yPos[b.id])).join("")}
        </div>
      </div>
    </div>
    <div class="bracket-bronze">
      <span class="bracket-bronze-label">Bronsefinale</span>
      ${allRounds.bronze.map((b) => {
        const s = state.get(b.id);
        const adv = s?.advanced;
        return `
          <div class="bracket-match" style="position:static; min-height:auto;" data-slot-id="${b.id}">
            ${bracketTeamRow(b.home, "home", s || {}, adv === "HOME", adv === "AWAY")}
            <div class="bracket-separator"></div>
            ${bracketTeamRow(b.away, "away", s || {}, adv === "AWAY", adv === "HOME")}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function setView(view) {
  const toggle = document.getElementById("view-toggle");
  toggle.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
  });
  const bracketArea = document.getElementById("bracket-svg-area");
  const listArea = document.getElementById("bracket-area");
  bracketArea.classList.toggle("hidden", view !== "bracket");
  listArea.classList.toggle("hidden", view !== "list");
  try { localStorage.setItem("tk_sluttspill_view", view); } catch {}
}

// Finn football-data-kampen som inneholder begge lagene i et slot (rekkefølge-
// uavhengig, robust mot navnevarianter via TLA).
function matchFdByTeams(slot, fdList, used) {
  if (!slot.home || !slot.away) return null;
  const ht = teamTla(slot.home), at = teamTla(slot.away);
  if (!ht || !at) return null;
  const found = (fdList || []).find((m) => {
    if (used.has(m.id)) return false;
    const a = teamTla(m.homeTeam), b = teamTla(m.awayTeam);
    return (a === ht && b === at) || (a === at && b === ht);
  });
  if (found) used.add(found.id);
  return found || null;
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

  const byDate = (a, b) => new Date(a.utcDate) - new Date(b.utcDate);
  const knockout = {
    LAST_32: matches.filter((m) => m.stage === "LAST_32").sort(byDate),
    LAST_16: matches.filter((m) => m.stage === "LAST_16").sort(byDate),
    QUARTER_FINALS: matches.filter((m) => m.stage === "QUARTER_FINALS").sort(byDate),
    SEMI_FINALS: matches.filter((m) => m.stage === "SEMI_FINALS").sort(byDate),
    THIRD_PLACE: matches.filter((m) => m.stage === "THIRD_PLACE"),
    FINAL: matches.filter((m) => m.stage === "FINAL"),
  };

  const allKo = [
    ...knockout.LAST_32, ...knockout.LAST_16, ...knockout.QUARTER_FINALS,
    ...knockout.SEMI_FINALS, ...knockout.THIRD_PLACE, ...knockout.FINAL,
  ];

  if (!knockout.LAST_32.length) {
    document.getElementById("bracket-area").innerHTML = `
      <div class="alert alert-warning">
        Sluttspillkampene er ikke lagt ut fra football-data ennå. Kom tilbake når
        gruppespillet nærmer seg slutten.
      </div>`;
    document.getElementById("bracket-svg-area").innerHTML = "";
    return;
  }

  const allKoIds = allKo.map((m) => m.id);
  const [betsRes, resultsRes] = await Promise.all([
    supabase.from("tk_match_bets").select("*").eq("player_id", me.id).in("match_id", allKoIds),
    supabase.from("tk_match_results").select("*").in("match_id", allKoIds),
  ]);
  const koBetByMatch = new Map((betsRes.data || []).map((b) => [b.match_id, b]));
  const resultByMatch = new Map((resultsRes.data || []).map((r) => [r.match_id, r]));

  // Vinnere fra FAKTISKE resultater (ikke spillerens tips). winner settes av
  // sync-results / admin og tar høyde for ekstraomganger + straffer.
  const resultWinners = (round) => round.map((b) => {
    const r = b.fdMatchId ? resultByMatch.get(b.fdMatchId) : null;
    return { matchId: b.id, winner: r?.winner || null };
  }).filter((w) => w.winner);

  const usedFd = new Set();
  const attachFd = (round, fdList) => {
    for (const b of round) {
      const fd = matchFdByTeams(b, fdList, usedFd);
      b.match = fd;
      b.fdMatchId = fd?.id || null;
    }
  };

  // R32 rett fra de faktiske kampene (buildLast32 fyller match + fdMatchId selv).
  const last32 = buildLast32(knockout.LAST_32);
  // Senere runder: lag fra de som faktisk gikk videre, deretter koble slottet
  // til riktig football-data-kamp via lag-match (gir match_id, avspark, lås).
  const last16 = buildLast16(last32, resultWinners(last32));
  attachFd(last16, knockout.LAST_16);
  const quarters = buildQuarters(last16, resultWinners(last16));
  attachFd(quarters, knockout.QUARTER_FINALS);
  const semis = buildSemis(quarters, resultWinners(quarters));
  attachFd(semis, knockout.SEMI_FINALS);
  const finalArr = buildFinal(semis, resultWinners(semis));
  attachFd(finalArr, knockout.FINAL);
  const bronze = buildThirdPlace(semis, resultWinners(semis));
  attachFd(bronze, knockout.THIRD_PLACE);

  allRounds = { last32, last16, quarters, semis, final: finalArr, bronze };

  const initState = (round) => {
    for (const b of round) {
      const fd = b.match || null;
      const fdId = b.fdMatchId || null;
      const bet = fdId ? koBetByMatch.get(fdId) : null;
      const r = fdId ? resultByMatch.get(fdId) : null;
      state.set(b.id, {
        home_goals: bet?.home_goals ?? null,
        away_goals: bet?.away_goals ?? null,
        original: {
          home_goals: bet?.home_goals ?? null,
          away_goals: bet?.away_goals ?? null,
        },
        // Lås nøyaktig ved avspark — samme regel som gruppespill/enkeltkamp.
        locked: fd ? !isOpenForBetting(fd) : false,
        match: fd,
        fdMatchId: fdId,
        advanced: r?.winner ?? null,
      });
      if (fdId) fdToSlot.set(fdId, b.id);
    }
  };
  [last32, last16, quarters, semis, finalArr, bronze].forEach(initState);

  render();

  // Liste-view: steppere (delegert, festes én gang på containeren).
  document.getElementById("bracket-area").addEventListener("click", (e) => {
    const stepBtn = e.target.closest(".gs-step-btn");
    if (!stepBtn) return;
    const m = stepBtn.closest("[data-slot-id]");
    if (!m) return;
    const slotId = m.dataset.slotId;
    const action = stepBtn.dataset.action;
    if (action === "inc-home") step(slotId, "home_goals", +1);
    else if (action === "dec-home") step(slotId, "home_goals", -1);
    else if (action === "inc-away") step(slotId, "away_goals", +1);
    else if (action === "dec-away") step(slotId, "away_goals", -1);
  });

  // Bracket-view: klikk på en kamp → bytt til liste og scroll til den.
  document.getElementById("bracket-svg-area").addEventListener("click", (e) => {
    const card = e.target.closest("[data-slot-id]");
    if (!card) return;
    const slotId = card.dataset.slotId;
    setView("list");
    setTimeout(() => {
      const target = document.querySelector(`#bracket-area [data-slot-id="${slotId}"]`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.style.transition = "background 0.5s";
        target.style.background = "var(--accent-soft)";
        setTimeout(() => { target.style.background = ""; }, 1500);
      }
    }, 100);
  });

  updateSaveBar();
}

async function save() {
  const dirty = [];
  // Tipp uten ekte match-ID kan ikke lagres. Det skal ikke lenger kunne
  // oppstå (stepperne er deaktivert), men om det skjer: SI FRA — et stille
  // dropp her har tidligere kostet spillere tipp de trodde var lagret.
  let unsavable = 0;
  for (const [, s] of state) {
    if (!isDirty(s) || s.locked) continue;
    if (!s.fdMatchId) { unsavable++; continue; }
    dirty.push({
      player_id: me.id,
      match_id: s.fdMatchId,
      home_goals: s.home_goals,
      away_goals: s.away_goals,
      updated_at: new Date().toISOString(),
    });
  }
  if (!dirty.length) {
    if (unsavable) {
      showAlert("warning", `${unsavable} tipp kan ikke lagres ennå — kampen mangler i kampoppsettet fra football-data. Prøv igjen senere.`);
    }
    return;
  }

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
    const slotId = fdToSlot.get(row.match_id);
    if (slotId) {
      const s = state.get(slotId);
      s.original.home_goals = row.home_goals;
      s.original.away_goals = row.away_goals;
    }
  }

  btn.textContent = "Lagre tipp";
  render();
  updateSaveBar();
  if (unsavable) {
    showAlert("warning", `Lagret ${dirty.length} tipp, men ${unsavable} kunne IKKE lagres — kampen mangler i kampoppsettet ennå. Prøv igjen senere.`);
  } else {
    showAlert("success", `Lagret ${dirty.length} tipp.`);
  }
}

document.getElementById("save-btn").addEventListener("click", save);

// View-toggle
document.getElementById("view-toggle").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (btn) setView(btn.dataset.view);
});

// Gjenopprett siste view-valg
const savedView = (() => {
  try { return localStorage.getItem("tk_sluttspill_view"); } catch { return null; }
})();
if (savedView === "list") setView("list");

document.getElementById("autofill-home").addEventListener("click", () => {
  let n = 0;
  for (const [, s] of state) {
    if (s.locked || !s.match) continue; // bare ekte, åpne kamper
    if (s.home_goals === null) { s.home_goals = 1; n++; }
    if (s.away_goals === null) { s.away_goals = 0; }
  }
  if (n) showAlert("info", `Fylte ut ${n} blanke kamper med 1–0 hjemme.`);
  render();
  updateSaveBar();
});

load();
