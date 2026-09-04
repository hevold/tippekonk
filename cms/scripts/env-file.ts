/**
 * Tiny .env loader for CLI scripts (dotenv is intentionally not a dependency).
 *
 * Loads `.env.local` then `.env` from the working directory into process.env
 * without overriding variables that are already set — the same precedence
 * Next.js uses. Call `loadEnvFiles()` BEFORE importing '@/env', which reads
 * process.env at import time (use dynamic imports after loading).
 *
 * Supported syntax: `KEY=value`, `export KEY=value`, `# comments`, single and
 * double quotes (with `\n` escapes inside double quotes), and trailing
 * ` # comment` after unquoted values.
 */
import fs from 'node:fs';
import path from 'node:path';

export function parseEnvFile(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1]!;
    let value = match[2]!.trim();
    if (value.startsWith('"')) {
      const end = value.indexOf('"', 1);
      value = end === -1 ? value.slice(1) : value.slice(1, end);
      value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"');
    } else if (value.startsWith("'")) {
      const end = value.indexOf("'", 1);
      value = end === -1 ? value.slice(1) : value.slice(1, end);
    } else {
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    out[key] = value;
  }
  return out;
}

/** Load env files into process.env. Returns the names of the files that were read. */
export function loadEnvFiles(
  cwd: string = process.cwd(),
  files: string[] = ['.env.local', '.env'],
): string[] {
  const loaded: string[] = [];
  for (const name of files) {
    const file = path.join(cwd, name);
    if (!fs.existsSync(file)) continue;
    const parsed = parseEnvFile(fs.readFileSync(file, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
    loaded.push(name);
  }
  return loaded;
}
