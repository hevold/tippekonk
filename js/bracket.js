// VM 2026-sluttspilltre (FIFA-kampnummer 73–104).
//
// TIDLIGERE: generisk seeded bracket (1v32, 16v17 …) fordi FIFAs spillplan ikke
// var publisert. Lagene ble fylt fra hver spillers gruppespilltipp → feil lag.
//
// NÅ: R32-lagene hentes fra de FAKTISKE football-data-kampene. Treet (hvem som
// møter hvem i neste runde) følger FIFAs offisielle oppsett — IKKE kronologisk
// rekkefølge. Eks: åttendedel M89 = vinner(M74) v vinner(M77), ikke M73 v M74.
//
// VERIFISERT mot football-datas faktiske kampoppsett (04.07.2026):
//   • R32-malen (kamp 73–88) — alle 16 kamper spilt og stemmer.
//   • R16-koblingen (89–96) — alle 8 kamper har lag i API-et og stemmer.
//     (M93/M96 var feil frem til 04.07: M83 og M87 var byttet om.)
// ANTAKELSER (sjekk mot football-data når lagene er fylt inn):
//   • QF/SF/finale (97–104): standard sammenkobling av påfølgende kamper.
//     Kvartfinalene får lag i API-et 7.–8. juli — verifiser da.
//
// Lagene vises uansett riktig: tar football-datas homeTeam/awayTeam når de
// finnes (gir riktig draktmerke + match_id for lagring/poeng), ellers fallback-
// navnet under. Matcher riktig kamp via anchor-laget (robust mot navnevarianter
// som Elfenbenskysten/Côte d'Ivoire, USA/United States, DR Kongo/Congo DR).

import { teamTla } from "./teams-no.js";

// id = FIFA-kampnr. anchor = TLA på ett lag vi vet er i kampen (for å finne
// riktig football-data-kamp). fb = [hjemme, borte] fallback-visningsnavn.
const R32 = [
  { id: "M73", anchor: "RSA", fb: ["Sør-Afrika", "Canada"] },
  { id: "M74", anchor: "GER", fb: ["Tyskland", "Paraguay"] },
  { id: "M75", anchor: "NED", fb: ["Nederland", "Marokko"] },
  { id: "M76", anchor: "BRA", fb: ["Brasil", "Japan"] },
  { id: "M77", anchor: "FRA", fb: ["Frankrike", "Sverige"] },
  { id: "M78", anchor: "NOR", fb: ["Elfenbenskysten", "Norge"] },
  { id: "M79", anchor: "MEX", fb: ["Mexico", "Ecuador"] },
  { id: "M80", anchor: "ENG", fb: ["England", "DR Kongo"] },
  { id: "M81", anchor: "BIH", fb: ["USA", "Bosnia-Hercegovina"] },
  { id: "M82", anchor: "BEL", fb: ["Belgia", "Senegal"] },
  { id: "M83", anchor: "COL", fb: ["Colombia", "Ghana"] },
  { id: "M84", anchor: "ESP", fb: ["Spania", "Østerrike"] },
  { id: "M85", anchor: "SUI", fb: ["Sveits", "Algerie"] },
  { id: "M86", anchor: "ARG", fb: ["Argentina", "Kapp Verde"] },
  { id: "M87", anchor: "POR", fb: ["Portugal", "Kroatia"] },
  { id: "M88", anchor: "EGY", fb: ["Australia", "Egypt"] },
];

// Treet videre: destinasjon → [kilde A, kilde B]. Rekkefølgen [A, B] skal følge
// hjemme/borte i football-data-kampen — tipp lagres som hjemme-/bortemål.
const WIRING = {
  // Åttendedelsfinaler (R16) — verifisert mot football-datas faktiske
  // kampoppsett 04.07.2026 (alle 8 kamper har lag i API-et):
  //   PAR-FRA, CAN-MAR, BRA-NOR, MEX-ENG, POR-ESP, USA-BEL, ARG-EGY, SUI-COL.
  // M93 og M96 var feil før (M83/M87 var byttet om): fasit er
  // Portugal–Spania og Sveits–Colombia.
  M89: ["M74", "M77"], M90: ["M73", "M75"],
  M91: ["M76", "M78"], M92: ["M79", "M80"],
  M93: ["M87", "M84"], M94: ["M81", "M82"],
  M95: ["M86", "M88"], M96: ["M85", "M83"],
  // Kvartfinaler
  M97: ["M89", "M90"], M98: ["M91", "M92"],
  M99: ["M93", "M94"], M100: ["M95", "M96"],
  // Semifinaler
  M101: ["M97", "M98"], M102: ["M99", "M100"],
};
const R16_IDS = ["M89", "M90", "M91", "M92", "M93", "M94", "M95", "M96"];
const QF_IDS = ["M97", "M98", "M99", "M100"];
const SF_IDS = ["M101", "M102"];

function fbTeam(name) {
  return name ? { name, _fallback: true } : null;
}

// Bygger R32 fra de faktiske football-data-kampene (stage LAST_32).
// Matcher hver slot til kampen som inneholder anchor-laget.
export function buildLast32(fdMatches) {
  const list = fdMatches || [];
  const used = new Set();
  return R32.map((slot, i) => {
    const fd = list.find((m) => {
      if (used.has(m.id)) return false;
      return teamTla(m.homeTeam) === slot.anchor || teamTla(m.awayTeam) === slot.anchor;
    });
    if (fd) used.add(fd.id);
    return {
      id: slot.id,
      round: "LAST_32",
      home: fd?.homeTeam || fbTeam(slot.fb[0]),
      away: fd?.awayTeam || fbTeam(slot.fb[1]),
      slot: i,
      match: fd || null,
      fdMatchId: fd?.id || null,
    };
  });
}

// Generisk runde-bygger basert på eksplisitt WIRING.
function buildRound(prevMatches, winners, ids, roundName) {
  const byId = new Map(prevMatches.map((m) => [m.id, m]));
  const winnerById = new Map(winners.map((w) => [w.matchId, w]));
  const pick = (id) => {
    const m = byId.get(id);
    const w = winnerById.get(id);
    if (!m || !w) return null;
    return w.winner === "HOME" ? m.home : m.away;
  };
  return ids.map((id, i) => {
    const [a, b] = WIRING[id];
    return {
      id,
      round: roundName,
      slot: i,
      home: pick(a),
      away: pick(b),
      sourceMatches: [a, b],
    };
  });
}

export function buildLast16(last32, winners) {
  return buildRound(last32, winners, R16_IDS, "LAST_16");
}
export function buildQuarters(last16, winners) {
  return buildRound(last16, winners, QF_IDS, "QUARTER_FINALS");
}
export function buildSemis(quarters, winners) {
  return buildRound(quarters, winners, SF_IDS, "SEMI_FINALS");
}

export function buildFinal(semis, winners) {
  const byId = new Map(semis.map((m) => [m.id, m]));
  const winnerById = new Map(winners.map((w) => [w.matchId, w]));
  const pick = (id) => {
    const m = byId.get(id);
    const w = winnerById.get(id);
    if (!m || !w) return null;
    return w.winner === "HOME" ? m.home : m.away;
  };
  return [{
    id: "M104",
    round: "FINAL",
    slot: 0,
    home: pick("M101"),
    away: pick("M102"),
    sourceMatches: ["M101", "M102"],
  }];
}

// Bronsefinale — taperne av semifinalene
export function buildThirdPlace(semis, winners) {
  const byId = new Map(semis.map((m) => [m.id, m]));
  const winnerById = new Map(winners.map((w) => [w.matchId, w]));
  const loser = (id) => {
    const m = byId.get(id);
    const w = winnerById.get(id);
    if (!m || !w) return null;
    return w.winner === "HOME" ? m.away : m.home;
  };
  return [{
    id: "M103",
    round: "THIRD_PLACE",
    slot: 0,
    home: loser("M101"),
    away: loser("M102"),
    sourceMatches: ["M101", "M102"],
  }];
}

export const ROUND_LABEL = {
  LAST_32: "Sekstendelsfinale",
  LAST_16: "Åttendedelsfinale",
  QUARTER_FINALS: "Kvartfinale",
  SEMI_FINALS: "Semifinale",
  THIRD_PLACE: "Bronsefinale",
  FINAL: "Finale",
};
