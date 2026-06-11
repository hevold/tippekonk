import { register, login, setSession, getSession } from './auth.js';

if (getSession()) window.location.href = 'dashboard.html';

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn, .tab-pane').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

function showAlert(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideAlert(id) { document.getElementById(id).classList.add('hidden'); }

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  hideAlert('login-alert');
  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.textContent = 'Logger inn…';
  try {
    const player = await login(document.getElementById('login-name').value, document.getElementById('login-pin').value);
    setSession(player);
    window.location.href = 'dashboard.html';
  } catch (err) {
    showAlert('login-alert', err.message);
    btn.disabled = false; btn.textContent = 'Logg inn';
  }
});

document.getElementById('register-form').addEventListener('submit', async e => {
  e.preventDefault();
  hideAlert('reg-alert');
  const pin = document.getElementById('reg-pin').value;
  const pin2 = document.getElementById('reg-pin2').value;
  if (!/^\d{4,8}$/.test(pin)) { showAlert('reg-alert', 'PIN må være 4–8 siffer'); return; }
  if (pin !== pin2) { showAlert('reg-alert', 'PIN-kodene stemmer ikke overens'); return; }
  const btn = document.getElementById('reg-btn');
  btn.disabled = true; btn.textContent = 'Registrerer…';
  try {
    const player = await register(document.getElementById('reg-name').value, pin);
    setSession(player);
    window.location.href = 'dashboard.html';
  } catch (err) {
    showAlert('reg-alert', err.message);
    btn.disabled = false; btn.textContent = 'Opprett konto';
  }
});
