import { FOOTBALL_API_KEY, COMPETITION } from './client.js';

const BASE = 'https://api.football-data.org/v4';
const CACHE_TTL = 5 * 60 * 1000;

function cacheKey(path) { return 'tk_fc_' + path; }

function fromCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}

function toCache(key, data) {
  try { sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); }
  catch { /* ignore quota errors */ }
}

async function apiFetch(path) {
  if (!FOOTBALL_API_KEY) throw new Error('NO_KEY');
  const key = cacheKey(path);
  const cached = fromCache(key);
  if (cached) return cached;
  const res = await fetch(BASE + path, { headers: { 'X-Auth-Token': FOOTBALL_API_KEY } });
  if (!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();
  toCache(key, data);
  return data;
}

export async function getMatches() {
  const data = await apiFetch(`/competitions/${COMPETITION}/matches`);
  return data.matches || [];
}

export async function getMatch(id) {
  return apiFetch(`/matches/${id}`);
}

export async function getTeams() {
  const data = await apiFetch(`/competitions/${COMPETITION}/teams`);
  return data.teams || [];
}

export function formatDate(utcDate) {
  if (!utcDate) return '';
  const d = new Date(utcDate);
  return d.toLocaleString('no-NO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function matchIsOpen(match) {
  return match.status === 'SCHEDULED' || match.status === 'TIMED';
}

export function scoreLabel(match) {
  if (!match.score?.fullTime) return '–';
  const { home, away } = match.score.fullTime;
  if (home === null || away === null) return '–';
  return `${home} – ${away}`;
}
