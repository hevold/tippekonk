import { requireAuth } from './auth.js';
import { db, FOOTBALL_API_KEY } from './client.js';
import { getMatch, formatDate, matchIsOpen } from './football.js';

const player = requireAuth();
if (!player) throw new Error('not auth');

const params = new URLSearchParams(location.search);
const matchId = parseInt(params.get('id'), 10);
if (!matchId) { window.location.href = 'matches.html'; }

function esc(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function val(id) { const v = document.getElementById(id).value.trim(); return v === '' ? null : v; }
function numVal(id) { const v = document.getElementById(id).value; return v === '' ? null : parseInt(v, 10); }

async function load() {
  const loading = document.getElementById('loading-state');
  const content = document.getElementById('match-content');
  const closed = document.getElementById('closed-state');

  try {
    let match = null;
    if (FOOTBALL_API_KEY) match = await getMatch(matchId);

    const { data: existingBet } = await db.from('tk_match_bets').select('*')
      .eq('player_id', player.id).eq('match_id', matchId).maybeSingle();

    loading.classList.add('hidden');
    const open = match ? matchIsOpen(match) : true;
    if (!open && !existingBet) { closed.classList.remove('hidden'); return; }
    content.classList.remove('hidden');

    if (match) {
      const home = match.homeTeam?.name || '?';
      const away = match.awayTeam?.name || '?';
      const homeShort = match.homeTeam?.shortName || home;
      const awayShort = match.awayTeam?.shortName || away;
      document.getElementById('match-vs').textContent = `${home} – ${away}`;
      document.getElementById('match-when').textContent = formatDate(match.utcDate);
      document.getElementById('label-home').innerHTML = `${esc(homeShort)} mål <span class="pts-badge">3p</span>`;
      document.getElementById('label-away').innerHTML = `${esc(awayShort)} mål <span class="pts-badge">3p</span>`;
      document.getElementById('label-home-y').textContent = homeShort;
      document.getElementById('label-away-y').textContent = awayShort;
      document.getElementById('label-home-r').textContent = homeShort;
      document.getElementById('label-away-r').textContent = awayShort;
    } else {
      document.getElementById('match-vs').textContent = `Kamp #${matchId}`;
      document.getElementById('match-when').textContent = 'Ingen API-nøkkel konfigurert';
    }

    if (existingBet) {
      const fill = (id, val) => { if (val !== null) document.getElementById(id).value = val; };
      fill('home-goals', existingBet.home_goals); fill('away-goals', existingBet.away_goals);
      fill('first-scorer', existingBet.first_scorer); fill('home-yellow', existingBet.home_yellow);
      fill('away-yellow', existingBet.away_yellow); fill('home-red', existingBet.home_red);
      fill('away-red', existingBet.away_red);
      document.getElementById('submit-btn').textContent = 'Oppdater tipp';
    }

    if (!open) {
      document.querySelectorAll('#bet-form input, #bet-form button').forEach(el => el.disabled = true);
      const alertEl = document.getElementById('bet-alert');
      alertEl.textContent = 'Tipping er stengt — du kan se ditt tipp, men ikke endre det.';
      alertEl.className = 'alert alert-info';
    }
  } catch (err) { loading.textContent = 'Feil: ' + err.message; }
}

document.getElementById('bet-form').addEventListener('submit', async e => {
  e.preventDefault();
  const alertEl = document.getElementById('bet-alert');
  const successEl = document.getElementById('bet-success');
  alertEl.classList.add('hidden'); successEl.classList.add('hidden');
  const btn = document.getElementById('submit-btn');
  btn.disabled = true; btn.textContent = 'Lagrer…';

  const bet = {
    player_id: player.id, match_id: matchId,
    home_goals: numVal('home-goals'), away_goals: numVal('away-goals'),
    first_scorer: val('first-scorer'), home_yellow: numVal('home-yellow'),
    away_yellow: numVal('away-yellow'), home_red: numVal('home-red'),
    away_red: numVal('away-red'), updated_at: new Date().toISOString()
  };

  const { error } = await db.from('tk_match_bets').upsert(bet, { onConflict: 'player_id,match_id' });
  if (error) { alertEl.textContent = 'Feil: ' + error.message; alertEl.classList.remove('hidden'); }
  else { successEl.classList.remove('hidden'); document.getElementById('submit-btn').textContent = 'Oppdater tipp'; }
  btn.disabled = false;
});

load();
