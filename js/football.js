// Wrapper rundt football-data.org/v4. Kallene går via en Supabase edge function ("football")
// som proxyer requestene og holder API-nøkkelen server-side. Frontend ser aldri nøkkelen.
//
// Cache: 5 minutter i sessionStorage per path. Holder rate-limit nede (tier 1: 10 req/min).
import { supabase, COMPETITION } from "./client.js";

const TTL_MS = 5 * 60 * 1000;

async function fetchJson(path) {
  const cacheKey = "fd:" + path;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try {
      const obj = JSON.parse(cached);
      if (Date.now() - obj.t < TTL_MS) return obj.data;
    } catch {}
  }

  const { data, error } = await supabase.functions.invoke("football", {
    body: { path },
  });
  if (error) {
    if (error.message?.includes("403")) throw new Error("API-nøkkel mangler tilgang til denne ressursen");
    if (error.message?.includes("429")) throw new Error("For mange spørringer mot football-data.org — vent litt");
    throw new Error("Football proxy: " + (error.message || "ukjent feil"));
  }
  if (data?.errorCode) {
    throw new Error("football-data: " + (data.message || data.errorCode));
  }
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), data }));
  } catch {}
  return data;
}

export async function getMatches() {
  const d = await fetchJson(`/competitions/${COMPETITION}/matches`);
  return d.matches || [];
}

export async function getMatch(matchId) {
  return fetchJson(`/matches/${matchId}`);
}

export async function getTeams() {
  const d = await fetchJson(`/competitions/${COMPETITION}/teams`);
  return d.teams || [];
}

// Odds fra The Odds API via edge-funksjonen "odds" (nøkkel server-side, cache i DB).
// Returnerer liste av events: { home_team, away_team, commence_time, bookmakers[] }.
export async function getOdds() {
  const cacheKey = "odds:all";
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try {
      const obj = JSON.parse(cached);
      if (Date.now() - obj.t < TTL_MS) return obj.data;
    } catch {}
  }
  const { data, error } = await supabase.functions.invoke("odds", { body: {} });
  if (error) throw new Error("Odds: " + (error.message || "ukjent feil"));
  if (data?.error) throw new Error("Odds: " + data.error);
  const events = data?.events || [];
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), data: events }));
  } catch {}
  return events;
}

export function isOpenForBetting(match) {
  // Stenger i det øyeblikket kampen starter (avspark) — også hvis status fra
  // football-data henger etter og fortsatt sier SCHEDULED/TIMED.
  const notStarted = match.status === "SCHEDULED" || match.status === "TIMED";
  const beforeKickoff = new Date(match.utcDate).getTime() > Date.now();
  return notStarted && beforeKickoff;
}

export function isLive(match) {
  return match.status === "IN_PLAY" || match.status === "PAUSED";
}

export function currentScore(match) {
  // Returnerer { home, away, label } eller null hvis ingen score
  if (match.score?.fullTime?.home !== null && match.score?.fullTime?.home !== undefined) {
    return { home: match.score.fullTime.home, away: match.score.fullTime.away, label: "FT" };
  }
  if (match.score?.regularTime?.home !== null && match.score?.regularTime?.home !== undefined) {
    return { home: match.score.regularTime.home, away: match.score.regularTime.away, label: "" };
  }
  if (match.score?.halfTime?.home !== null && match.score?.halfTime?.home !== undefined) {
    return { home: match.score.halfTime.home, away: match.score.halfTime.away, label: "HT" };
  }
  return null;
}

export function statusBadge(match) {
  // "Tipp åpen" skal aldri vises etter avspark, selv med hengende status.
  if ((match.status === "SCHEDULED" || match.status === "TIMED") && !isOpenForBetting(match)) {
    return { text: "Stengt", cls: "status-done" };
  }
  switch (match.status) {
    case "IN_PLAY": return { text: "Live", cls: "status-live" };
    case "PAUSED": return { text: "Pause", cls: "status-live" };
    case "FINISHED": return { text: "Ferdig", cls: "status-done" };
    case "POSTPONED": return { text: "Utsatt", cls: "status-done" };
    case "SUSPENDED": return { text: "Avbrutt", cls: "status-done" };
    case "CANCELED": return { text: "Avlyst", cls: "status-done" };
    case "SCHEDULED":
    case "TIMED": return { text: "Tipp åpen", cls: "status-open" };
    default: return { text: match.status || "?", cls: "status-done" };
  }
}

// Trigger auto-sync. sessionStorage-debounced — max én gang per 5 minutter per session.
export async function autoSync() {
  const last = Number(sessionStorage.getItem("tk_last_sync") || 0);
  if (Date.now() - last < 5 * 60 * 1000) return null;
  sessionStorage.setItem("tk_last_sync", String(Date.now()));
  try {
    const { data, error } = await supabase.functions.invoke("sync-results", { body: {} });
    if (error) return { error: error.message };
    return data;
  } catch (err) {
    return { error: String(err) };
  }
}

export async function manualSync() {
  // Bypass cache
  sessionStorage.removeItem("tk_last_sync");
  return autoSync();
}

export function formatKickoff(iso) {
  const d = new Date(iso);
  return d.toLocaleString("nb-NO", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function clearCache() {
  for (const k of Object.keys(sessionStorage)) {
    if (k.startsWith("fd:")) sessionStorage.removeItem(k);
  }
}
