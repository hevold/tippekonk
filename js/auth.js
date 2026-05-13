// PIN-basert auth. Ingen e-post, ingen OAuth. PIN hashes klient-side med SHA-256 og en
// hardkodet salt. Hash sammenlignes mot tk_players.pin_hash.
import { supabase } from "./client.js";

const SALT = "tippekonk-vm2026";
const STORAGE_KEY = "tk_player";

async function hashPin(pin) {
  const enc = new TextEncoder().encode(SALT + ":" + pin);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getSession() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function setSession(player) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(player));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function requireAuth() {
  const s = getSession();
  if (!s) {
    window.location.href = "index.html";
    return null;
  }
  return s;
}

export async function login(name, pin) {
  if (!name || !pin) throw new Error("Navn og PIN må fylles ut");
  const pin_hash = await hashPin(pin);
  const { data, error } = await supabase
    .from("tk_players")
    .select("*")
    .eq("name", name.trim())
    .eq("pin_hash", pin_hash)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Feil navn eller PIN");
  setSession(data);
  return data;
}

export async function register(name, pin) {
  if (!name || !pin) throw new Error("Navn og PIN må fylles ut");
  if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN må være 4–8 sifre");
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Navn må fylles ut");

  const pin_hash = await hashPin(pin);
  const { data, error } = await supabase
    .from("tk_players")
    .insert({ name: cleanName, pin_hash })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("Navnet er allerede tatt");
    throw error;
  }
  setSession(data);
  return data;
}

export async function refreshSession() {
  const cur = getSession();
  if (!cur) return null;
  const { data, error } = await supabase
    .from("tk_players")
    .select("*")
    .eq("id", cur.id)
    .maybeSingle();
  if (error || !data) {
    clearSession();
    return null;
  }
  setSession(data);
  return data;
}
