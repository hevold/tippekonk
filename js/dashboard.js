import { requireAuth, clearSession } from './auth.js';
import { db } from './client.js';
import { calcLeaderboard } from './scoring.js';

const player = requireAuth();
if (!player) throw new Error('not auth');

document.getElementById('user-name').textContent = player.name;
document.getElementById('logout-btn').addEventListener('click', e => {
  e.preventDefault(); clearSession(); window.location.href = 'index.html';
});

if (player.is_admin) document.getElementById('admin-link').style.display = '';

async function renderLeaderboard() {
  const wrap = document.getElementById('leaderboard-wrap');
  try {
    const rows = await calcLeaderboard(db);
    if (!rows.length) { wrap.innerHTML = '<p class="loading-state">Ingen deltakere ennå.</p>'; return; }
    const tbl = document.createElement('table');
    tbl.className = 'lb-table';
    tbl.innerHTML = `<thead><tr><th>#</th><th>Navn</th><th class="right">Poeng</th></tr></thead><tbody></tbody>`;
    const tbody = tbl.querySelector('tbody');
    rows.forEach((r, i) => {
      const rank = i + 1;
      const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-other';
      const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
      const tr = document.createElement('tr');
      if (r.id === player.id) tr.className = 'is-me';
      tr.innerHTML = `
        <td><span class="rank ${rankClass}">${rankIcon}</span></td>
        <td>${esc(r.name)}${r.id === player.id ? ' <span class="bet-chip chip-done">deg</span>' : ''}</td>
        <td class="pts-cell">${r.pts}</td>`;
      tbody.appendChild(tr);
    });
    wrap.innerHTML = ''; wrap.appendChild(tbl);
  } catch (err) {
    wrap.innerHTML = `<p class="loading-state">${esc(err.message)}</p>`;
  }
}

async function renderMyBets() {
  const wrap = document.getElementById('my-bets-summary');
  const [{ data: matchBets }, { data: tBet }] = await Promise.all([
    db.from('tk_match_bets').select('match_id').eq('player_id', player.id),
    db.from('tk_tournament_bets').select('id').eq('player_id', player.id).maybeSingle()
  ]);
  const matchCount = matchBets?.length || 0;
  const hasTournament = !!tBet;
  wrap.innerHTML = `
    <div style="display:flex;gap:1.5rem;flex-wrap:wrap">
      <div>
        <div style="font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);font-weight:700;margin-bottom:0.3rem">Kamptipper</div>
        <div style="font-size:1.4rem;font-weight:700;color:var(--accent)">${matchCount}</div>
        <a href="matches.html" style="font-size:0.82rem;color:var(--accent);text-decoration:underline">Legg inn tipper →</a>
      </div>
      <div>
        <div style="font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);font-weight:700;margin-bottom:0.3rem">Turneringstipper</div>
        <div style="font-size:1.4rem;font-weight:700;color:${hasTournament ? 'var(--accent)' : 'var(--muted)'}">${hasTournament ? '✓' : '—'}</div>
        <a href="tournament.html" style="font-size:0.82rem;color:var(--accent);text-decoration:underline">${hasTournament ? 'Endre tipper →' : 'Legg inn tipper →'}</a>
      </div>
    </div>`;
}

function esc(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

renderLeaderboard();
renderMyBets();
