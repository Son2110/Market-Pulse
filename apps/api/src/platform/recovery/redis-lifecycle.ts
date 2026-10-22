export interface ReconnectBackoffOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  canReconnect?: () => boolean;
}

export function computeReconnectDelayMs(
  retries: number,
  options: ReconnectBackoffOptions = {},
): number | false {
  if (options.canReconnect && !options.canReconnect()) {
    return false;
  }
  const baseDelayMs = Math.max(10, Math.trunc(options.baseDelayMs ?? 100));
  const maxDelayMs = Math.max(baseDelayMs, Math.trunc(options.maxDelayMs ?? 1000));
  const step = Math.max(1, Math.trunc(retries) + 1);
  return Math.min(baseDelayMs * step, maxDelayMs);
}

export function logDependencyTransitions(service: "redis" | "mongodb", role: "api" | "worker") {
  let previous: boolean | undefined;
  return (ready: boolean) => {
    if (previous === ready) return;
    const before = previous;
    previous = ready;
    if (ready && before === undefined) return;
    console.info(JSON.stringify({ event: ready ? "capability_restored" : "dependency_unavailable", service, role }));
    if (!ready) console.info(JSON.stringify({ event: "capability_degraded", service, role }));
  };
}
