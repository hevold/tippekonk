import { requireAuth } from './auth.js';
import { db, FOOTBALL_API_KEY } from './client.js';
import { getMatches, formatDate } from './football.js';

const player = requireAuth();
if (!player) throw new Error('not auth');

if (!player.is_admin) { window.location.href = 'dashboard.html'; throw new Error('not admin'); }

const matchSelect = document.getElementById('match-select');

async function loadMatchOptions() {
  if (!FOOTBALL_API_KEY) { matchSelect.innerHTML = '<option value="">Ingen API-nøkkel konfigurert</option>'; return; }
  try {
    const matches = await getMatches();
    const { data: existing } = await db.from('tk_match_results').select('match_id');
    const doneSet = new Set((existing || []).map(r => r.match_id));
    matchSelect.innerHTML = '<option value="">— Velg kamp —</option>';
    for (const m of matches) {
      const home = m.homeTeam?.shortName || m.homeTeam?.name || '?';
      const away = m.awayTeam?.shortName || m.awayTeam?.name || '?';
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${home} – ${away}  (${formatDate(m.utcDate)})${doneSet.has(m.id) ? ' ✓' : ''}`;
      opt.dataset.home = m.homeTeam?.name || home;
      opt.dataset.away = m.awayTeam?.name || away;
      matchSelect.appendChild(opt);
    }
  } catch (err) { matchSelect.innerHTML = `<option>Feil: ${err.message}</option>`; }
}

matchSelect.addEventListener('change', async () => {
  const id = parseInt(matchSelect.value, 10);
  if (!id) return;
  const opt = matchSelect.selectedOptions[0];
  document.getElementById('res-home-label').textContent = (opt.dataset.home || 'Hjemmelag') + ' mål';
  document.getElementById('res-away-label').textContent = (opt.dataset.away || 'Bortelag') + ' mål';
  const { data } = await db.from('tk_match_results').select('*').eq('match_id', id).maybeSingle();
  if (data) {
    const fill = (el, v) => { if (v != null) document.getElementById(el).value = v; };
    fill('res-home-goals', data.home_goals); fill('res-away-goals', data.away_goals);
    fill('res-first-scorer', data.first_scorer); fill('res-home-yellow', data.home_yellow);
    fill('res-away-yellow', data.away_yellow); fill('res-home-red', data.home_red); fill('res-away-red', data.away_red);
  } else {
    ['res-home-goals','res-away-goals','res-first-scorer','res-home-yellow','res-away-yellow','res-home-red','res-away-red']
      .forEach(id => document.getElementById(id).value = '');
  }
});

document.getElementById('result-form').addEventListener('submit', async e => {
  e.preventDefault();
  const alertEl = document.getElementById('result-alert');
  const successEl = document.getElementById('result-success');
  alertEl.classList.add('hidden'); successEl.classList.add('hidden');
  const matchId = parseInt(matchSelect.value, 10);
  if (!matchId) { alertEl.textContent = 'Velg en kamp'; alertEl.classList.remove('hidden'); return; }
  const btn = document.getElementById('result-btn');
  btn.disabled = true;
  const numVal = id => { const v = document.getElementById(id).value; return v === '' ? null : parseInt(v, 10); };
  const strVal = id => { const v = document.getElementById(id).value.trim(); return v || null; };
  const result = {
    match_id: matchId, home_goals: numVal('res-home-goals'), away_goals: numVal('res-away-goals'),
    first_scorer: strVal('res-first-scorer'), home_yellow: numVal('res-home-yellow'),
    away_yellow: numVal('res-away-yellow'), home_red: numVal('res-home-red'), away_red: numVal('res-away-red')
  };
  const { error } = await db.from('tk_match_results').upsert(result, { onConflict: 'match_id' });
  if (error) { alertEl.textContent = 'Feil: ' + error.message; alertEl.classList.remove('hidden'); }
  else { successEl.classList.remove('hidden'); loadMatchOptions(); }
  btn.disabled = false;
});

let trExtra = null;
document.getElementById('tr-extra-toggle').addEventListener('click', e => {
  const btn = e.target.closest('.toggle-btn');
  if (!btn) return;
  document.querySelectorAll('#tr-extra-toggle .toggle-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  trExtra = btn.dataset.val === 'true';
});

async function loadTournamentResult() {
  const { data } = await db.from('tk_tournament_results').select('*').limit(1).maybeSingle();
  if (!data) return;
  const fill = (el, v) => { if (v != null) document.getElementById(el).value = v; };
  fill('tr-winner', data.winner); fill('tr-top-scorer', data.top_scorer);
  fill('tr-golden-glove', data.golden_glove); fill('tr-most-goals-team', data.most_goals_team);
  fill('tr-most-yellow-team', data.most_yellow_cards_team); fill('tr-most-red-team', data.most_red_cards_team);
  fill('tr-total-goals', data.total_goals);
  if (data.final_extra_time != null) {
    trExtra = data.final_extra_time;
    document.querySelectorAll('#tr-extra-toggle .toggle-btn').forEach(btn => {
      if ((btn.dataset.val === 'true') === data.final_extra_time) btn.classList.add('selected');
    });
  }
}

document.getElementById('tournament-result-form').addEventListener('submit', async e => {
  e.preventDefault();
  const alertEl = document.getElementById('tr-alert');
  const successEl = document.getElementById('tr-success');
  alertEl.classList.add('hidden'); successEl.classList.add('hidden');
  const val = id => { const v = document.getElementById(id).value.trim(); return v || null; };
  const numVal = id => { const v = document.getElementById(id).value; return v === '' ? null : parseInt(v, 10); };
  const result = {
    winner: val('tr-winner'), top_scorer: val('tr-top-scorer'), golden_glove: val('tr-golden-glove'),
    most_goals_team: val('tr-most-goals-team'), most_yellow_cards_team: val('tr-most-yellow-team'),
    most_red_cards_team: val('tr-most-red-team'), total_goals: numVal('tr-total-goals'), final_extra_time: trExtra
  };
  await db.from('tk_tournament_results').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { error } = await db.from('tk_tournament_results').insert(result);
  if (error) { alertEl.textContent = 'Feil: ' + error.message; alertEl.classList.remove('hidden'); }
  else { successEl.classList.remove('hidden'); }
});

loadMatchOptions();
loadTournamentResult();
