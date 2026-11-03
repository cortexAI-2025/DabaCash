/**
 * One key per user intent ("this checkout"), not per click: a double click or a network retry
 * sends the same key, so the server returns the original result instead of doing it twice.
 */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  const id = c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `web-${id}`.slice(0, 100);
}
