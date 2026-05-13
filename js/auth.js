// PIN-basert auth. Ingen e-post, ingen OAuth. PIN hashes klient-side med SHA-256 og en
// hardkodet salt. Hash sammenlignes mot tk_players.pin_hash.
import { supabase } from "./client.js";

const SALT = "tippekonk-vm2026";
const INVITE_SALT = "tippekonk-invite-2026";
const STORAGE_KEY = "tk_player";

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPin(pin) {
  return sha256Hex(SALT + ":" + pin);
}

export async function hashInviteCode(code) {
  return sha256Hex(INVITE_SALT + ":" + code.trim().toLowerCase());
}

async function validateInviteCode(code) {
  const hash = await hashInviteCode(code);
  const { data, error } = await supabase
    .from("tk_settings")
    .select("value")
    .eq("key", "invite_code_hash")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Invitasjonskode er ikke satt opp i systemet");
  return data.value === hash;
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

export async function register(name, pin, inviteCode) {
  if (!name || !pin) throw new Error("Navn og PIN må fylles ut");
  if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN må være 4–8 sifre");
  if (!inviteCode || !inviteCode.trim()) throw new Error("Invitasjonskode må fylles ut");
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Navn må fylles ut");

  const ok = await validateInviteCode(inviteCode);
  if (!ok) throw new Error("Feil invitasjonskode");

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

export async function updateInviteCode(newCode) {
  if (!newCode || newCode.trim().length < 4) throw new Error("Koden må være minst 4 tegn");
  const hash = await hashInviteCode(newCode);
  const { error } = await supabase
    .from("tk_settings")
    .upsert({ key: "invite_code_hash", value: hash, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
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
