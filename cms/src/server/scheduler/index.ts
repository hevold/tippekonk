/**
 * In-process scheduler (scheduled publishing, webhook delivery, housekeeping).
 * Started from instrumentation.ts when ENABLE_INTERNAL_SCHEDULER is true.
 * The same `tick()` is exposed through /api/cron/tick for external cron.
 *
 * Placeholder — implemented by the integrations feature.
 */
export async function tick(): Promise<{ published: number; webhooks: number }> {
  return { published: 0, webhooks: 0 };
}

let started = false;
export function startScheduler(intervalMs = 30_000): void {
  if (started) return;
  started = true;
  const timer = setInterval(() => {
    tick().catch((err) => console.error('[scheduler]', err));
  }, intervalMs);
  timer.unref?.();
}
