// Wrapper rundt football-data.org/v4. Cacher GET-respons i sessionStorage i 5 minutter
// for å holde rate-limit nede (tier 1: 10 req/min).
import { COMPETITION } from "./client.js";

const API_BASE = "https://api.football-data.org/v4";
const API_KEY = "56b35bf112d04bd5adfbf63ee7a81ae0";
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

  const res = await fetch(API_BASE + path, {
    headers: { "X-Auth-Token": API_KEY },
  });
  if (!res.ok) {
    if (res.status === 403) throw new Error("API-nøkkel mangler tilgang til denne ressursen");
    if (res.status === 429) throw new Error("For mange spørringer mot football-data.org — vent litt og prøv igjen");
    throw new Error("Football API: " + res.status);
  }
  const data = await res.json();
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

export function isOpenForBetting(match) {
  return match.status === "SCHEDULED" || match.status === "TIMED";
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
