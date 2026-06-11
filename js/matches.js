import { requireAuth } from './auth.js';
import { db, FOOTBALL_API_KEY } from './client.js';
import { getMatches, formatDate, matchIsOpen, scoreLabel } from './football.js';

const player = requireAuth();
if (!player) throw new Error('not auth');

document.getElementById('user-name').textContent = player.name;

function esc(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function buildMatchItem(match, hasBet) {
  const open = matchIsOpen(match);
  const finished = match.status === 'FINISHED';
  const home = match.homeTeam?.shortName || match.homeTeam?.name || '?';
  const away = match.awayTeam?.shortName || match.awayTeam?.name || '?';
  const score = finished ? scoreLabel(match) : '–';

  let chipClass, chipText;
  if (!open && !finished) { chipClass = 'chip-closed'; chipText = 'Stengt'; }
  else if (hasBet) { chipClass = 'chip-placed'; chipText = 'Tippet'; }
  else { chipClass = 'chip-open'; chipText = 'Tip nå'; }

  const li = document.createElement('li');
  if (open) {
    li.innerHTML = `<a class="match-item" href="match.html?id=${match.id}">
      <div class="match-teams"><div class="teams-label">${esc(home)} – ${esc(away)}</div><div class="match-meta">${esc(formatDate(match.utcDate))} · ${esc(match.stage?.replace(/_/g, ' ') || '')}</div></div>
      <div class="match-score-col">${score}</div>
      <span class="match-status-chip ${chipClass}">${chipText}</span>
    </a>`;
  } else {
    li.innerHTML = `<div class="match-item" style="${!open && !finished ? 'opacity:0.7;cursor:default' : ''}">
      <div class="match-teams"><div class="teams-label">${esc(home)} – ${esc(away)}</div><div class="match-meta">${esc(formatDate(match.utcDate))} · ${esc(match.stage?.replace(/_/g, ' ') || '')}</div></div>
      <div class="match-score-col">${score}</div>
      <span class="match-status-chip ${chipClass}">${chipText}</span>
    </div>`;
  }
  return li;
}

async function load() {
  const list = document.getElementById('matches-list');
  const finishedList = document.getElementById('finished-list');

  if (!FOOTBALL_API_KEY) {
    document.getElementById('no-key-alert').classList.remove('hidden');
    list.innerHTML = '<li class="loading-state">Ingen API-nøkkel konfigurert.</li>';
    return;
  }

  try {
    const [matches, { data: myBets }] = await Promise.all([
      getMatches(),
      db.from('tk_match_bets').select('match_id').eq('player_id', player.id)
    ]);
    const betSet = new Set((myBets || []).map(b => b.match_id));
    const upcoming = matches.filter(m => matchIsOpen(m) || m.status === 'IN_PLAY' || m.status === 'PAUSED');
    const finished = matches.filter(m => m.status === 'FINISHED');
    list.innerHTML = '';
    if (!upcoming.length) { list.innerHTML = '<li class="loading-state">Ingen kommende kamper funnet.</li>'; }
    else { for (const m of upcoming) list.appendChild(buildMatchItem(m, betSet.has(m.id))); }
    if (finished.length) {
      document.getElementById('finished-card').style.display = '';
      for (const m of finished.reverse()) finishedList.appendChild(buildMatchItem(m, betSet.has(m.id)));
    }
  } catch (err) {
    list.innerHTML = `<li class="loading-state">Feil: ${esc(err.message)}</li>`;
  }
}

load();
