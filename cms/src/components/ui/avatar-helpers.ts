/**
 * Pure helpers for <Avatar>: initials and a stable colour tint per name.
 */

/** "Kari Nordmann" → "KN"; "NTB" → "NT"; "" → "?" */
export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s\-–]+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

const TINTS = [
  'bg-status-approved-bg text-status-approved-fg',
  'bg-status-published-bg text-status-published-fg',
  'bg-status-scheduled-bg text-status-scheduled-fg',
  'bg-status-in-review-bg text-status-in-review-fg',
  'bg-status-unpublished-bg text-status-unpublished-fg',
  'bg-status-archived-bg text-status-archived-fg',
] as const;

/** Deterministic tint classes for a name. */
export function avatarTint(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length]!;
}
