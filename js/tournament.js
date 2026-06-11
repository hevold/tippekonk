import { requireAuth } from './auth.js';
import { db, FOOTBALL_API_KEY } from './client.js';
import { getTeams } from './football.js';

const player = requireAuth();
if (!player) throw new Error('not auth');

document.getElementById('user-name').textContent = player.name;

let extraTime = null;
document.getElementById('extra-time-toggle').addEventListener('click', e => {
  const btn = e.target.closest('.toggle-btn');
  if (!btn) return;
  document.querySelectorAll('#extra-time-toggle .toggle-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  extraTime = btn.dataset.val === 'true';
  document.getElementById('extra-time-val').value = String(extraTime);
});

if (FOOTBALL_API_KEY) {
  getTeams().then(teams => {
    const dl = document.getElementById('teams-list');
    dl.innerHTML = teams.map(t => `<option value="${t.name}">`).join('');
  }).catch(() => {});
}

async function loadExisting() {
  const { data } = await db.from('tk_tournament_bets').select('*').eq('player_id', player.id).maybeSingle();
  if (!data) return;
  const fill = (id, val) => { if (val != null) document.getElementById(id).value = val; };
  fill('winner', data.winner); fill('top-scorer', data.top_scorer);
  fill('golden-glove', data.golden_glove); fill('most-goals-team', data.most_goals_team);
  fill('most-yellow-team', data.most_yellow_cards_team); fill('most-red-team', data.most_red_cards_team);
  fill('total-goals', data.total_goals);
  if (data.final_extra_time != null) {
    extraTime = data.final_extra_time;
    document.querySelectorAll('#extra-time-toggle .toggle-btn').forEach(btn => {
      if ((btn.dataset.val === 'true') === data.final_extra_time) btn.classList.add('selected');
    });
    document.getElementById('extra-time-val').value = String(extraTime);
  }
  document.getElementById('submit-btn').textContent = 'Oppdater turneringstipper';
}

loadExisting();

document.getElementById('tournament-form').addEventListener('submit', async e => {
  e.preventDefault();
  const alertEl = document.getElementById('tournament-alert');
  const successEl = document.getElementById('tournament-success');
  alertEl.classList.add('hidden'); successEl.classList.add('hidden');
  const btn = document.getElementById('submit-btn');
  btn.disabled = true; btn.textContent = 'Lagrer…';
  const val = id => { const v = document.getElementById(id).value.trim(); return v === '' ? null : v; };
  const numVal = id => { const v = document.getElementById(id).value; return v === '' ? null : parseInt(v, 10); };
  const bet = {
    player_id: player.id, winner: val('winner'), top_scorer: val('top-scorer'),
    golden_glove: val('golden-glove'), most_goals_team: val('most-goals-team'),
    most_yellow_cards_team: val('most-yellow-team'), most_red_cards_team: val('most-red-team'),
    total_goals: numVal('total-goals'), final_extra_time: extraTime, updated_at: new Date().toISOString()
  };
  const { error } = await db.from('tk_tournament_bets').upsert(bet, { onConflict: 'player_id' });
  if (error) { alertEl.textContent = 'Feil: ' + error.message; alertEl.classList.remove('hidden'); }
  else { successEl.classList.remove('hidden'); btn.textContent = 'Oppdater turneringstipper'; }
  btn.disabled = false;
});
