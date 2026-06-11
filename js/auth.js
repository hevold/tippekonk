import { db } from './client.js';

const SALT = 'tippekonk-vm2026';

async function hashPin(pin) {
  const data = new TextEncoder().encode(SALT + pin);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function register(name, pin) {
  const pin_hash = await hashPin(pin);
  const { data, error } = await db
    .from('tk_players')
    .insert({ name: name.trim(), pin_hash })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('Det navnet er allerede tatt');
    throw new Error('Registrering feilet: ' + error.message);
  }
  return data;
}

export async function login(name, pin) {
  const pin_hash = await hashPin(pin);
  const { data, error } = await db
    .from('tk_players')
    .select('*')
    .eq('name', name.trim())
    .eq('pin_hash', pin_hash)
    .single();
  if (error || !data) throw new Error('Feil navn eller PIN');
  return data;
}

export function setSession(player) {
  localStorage.setItem('tk_player', JSON.stringify(player));
}

export function getSession() {
  try { return JSON.parse(localStorage.getItem('tk_player')); }
  catch { return null; }
}

export function clearSession() {
  localStorage.removeItem('tk_player');
}

export function requireAuth() {
  const player = getSession();
  if (!player) { window.location.href = 'index.html'; return null; }
  return player;
}
