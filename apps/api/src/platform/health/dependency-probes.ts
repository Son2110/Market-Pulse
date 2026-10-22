import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface ProbeExecutionContext {
  readonly settlements: Set<Promise<unknown>>;
  readonly onTimeoutCallbacks: Set<() => void>;
  timedOut: boolean;
  markTimedOut(): void;
}

export const probeContextStorage = new AsyncLocalStorage<ProbeExecutionContext>();

export function createExecutionContext(parent?: ProbeExecutionContext): ProbeExecutionContext {
  const settlements = new Set<Promise<unknown>>();
  const onTimeoutCallbacks = new Set<() => void>();
  const ctx: ProbeExecutionContext = {
    settlements,
    onTimeoutCallbacks,
    timedOut: parent?.timedOut ?? false,
    markTimedOut(): void {
      if (ctx.timedOut) return;
      ctx.timedOut = true;
      for (const callback of Array.from(onTimeoutCallbacks)) {
        try {
          callback();
        } catch {
          // ignore callback errors
        }
      }
    },
  };
  if (parent) {
    parent.onTimeoutCallbacks.add(() => ctx.markTimedOut());
  }
  return ctx;
}

export async function waitForAllSettled(
  rootSettlement: Promise<unknown>,
  tracked: Set<Promise<unknown>>,
): Promise<void> {
  await rootSettlement;
  while (tracked.size > 0) {
    const batch = Array.from(tracked);
    tracked.clear();
    await Promise.allSettled(batch);
  }
}

export function trackOperation<T>(operation: () => Promise<T> | T): Promise<T> {
  let operationPromise: Promise<T>;
  try {
    operationPromise = Promise.resolve().then(operation);
  } catch (error) {
    return Promise.reject(error);
  }
  const settled = operationPromise.then(
    () => undefined,
    () => undefined,
  );
  probeContextStorage.getStore()?.settlements.add(settled);
  return operationPromise;
}

export class DependencyTimeoutError extends Error {
  constructor(message = "dependency_timeout") {
    super(message);
    this.name = "DependencyTimeoutError";
  }
}

export function withinTimeout<T>(
  operation: () => Promise<T> | T,
  timeoutMs: number,
  label = "dependency_timeout",
): Promise<T> {
  const boundedMs = Math.max(1, Math.trunc(timeoutMs));
  const activeContext = probeContextStorage.getStore();
  let timer: NodeJS.Timeout | undefined;
  let settled = false;
  let operationPromise: Promise<T>;
  try {
    operationPromise = Promise.resolve().then(operation);
  } catch (error) {
    return Promise.reject(error);
  }
  const settledOperation = operationPromise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  activeContext?.settlements.add(settledOperation);

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      if (!settled) {
        activeContext?.markTimedOut();
      }
      reject(new DependencyTimeoutError(label));
    }, boundedMs);
  });

  return Promise.race([operationPromise, timeoutPromise]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

export interface BoundedProbeOptions {
  timeoutMs?: number;
  maxInFlight?: number;
  onResult?: (ready: boolean) => void;
}

export interface BoundedProbe {
  probe: () => Promise<boolean>;
  readonly inFlight: number;
}

export function createBoundedProbe(
  check: () => Promise<boolean> | boolean,
  options: BoundedProbeOptions = {},
): BoundedProbe {
  const timeoutMs = Math.max(1, Math.trunc(options.timeoutMs ?? 1000));
  const maxInFlight = Math.max(1, Math.trunc(options.maxInFlight ?? 4));
  let active = 0;

  const probe = async (): Promise<boolean> => {
    if (active >= maxInFlight) {
      return false;
    }
    active += 1;
    const parentContext = probeContextStorage.getStore();
    const executionContext = createExecutionContext(parentContext);
    let settledWithinBudget = false;
    let resultReported = false;
    let timer: NodeJS.Timeout | undefined;

    const reportResult = (ready: boolean): void => {
      if (resultReported) return;
      resultReported = true;
      options.onResult?.(ready);
    };

    executionContext.onTimeoutCallbacks.add(() => {
      if (!settledWithinBudget) {
        reportResult(false);
      }
    });

    let rawPromise: Promise<boolean>;
    try {
      rawPromise = probeContextStorage.run(executionContext, () =>
        Promise.resolve().then(check).then(Boolean),
      );
    } catch {
      active -= 1;
      reportResult(false);
      return false;
    }

    const outcomePromise = rawPromise.then(
      (ok) => {
        if (executionContext.timedOut) {
          reportResult(false);
          return false;
        }
        settledWithinBudget = true;
        const finalOk = Boolean(ok);
        reportResult(finalOk);
        return finalOk;
      },
      () => {
        if (executionContext.timedOut) {
          reportResult(false);
          return false;
        }
        settledWithinBudget = true;
        reportResult(false);
        return false;
      },
    );

    const fullSettlement = waitForAllSettled(
      outcomePromise.then(
        () => undefined,
        () => undefined,
      ),
      executionContext.settlements,
    ).finally(() => {
      active -= 1;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    });

    parentContext?.settlements.add(fullSettlement);

    const timeoutPromise = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => {
        if (!settledWithinBudget) {
          executionContext.markTimedOut();
          parentContext?.markTimedOut();
          reportResult(false);
        }
        resolve(false);
      }, timeoutMs);
    });

    return Promise.race([outcomePromise, timeoutPromise]).finally(() => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    });
  };

  return {
    probe,
    get inFlight(): number {
      return active;
    },
  };
}

export interface WorkerHealthHandlerOptions {
  timeoutMs?: number;
  maxInFlight?: number;
  isShuttingDown?: () => boolean;
}

export function createWorkerHealthHandler(
  checkReady: () => Promise<boolean> | boolean,
  options: WorkerHealthHandlerOptions = {},
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const bounded = createBoundedProbe(async () => {
    if (options.isShuttingDown?.()) return false;
    return Boolean(await checkReady());
  }, {
    timeoutMs: options.timeoutMs ?? 1000,
    maxInFlight: options.maxInFlight ?? 4,
  });

  return async (_request: IncomingMessage, response: ServerResponse): Promise<void> => {
    let ready = false;
    try {
      ready = await bounded.probe();
    } catch {
      ready = false;
    }
    if (!response.headersSent) {
      response.statusCode = ready ? 200 : 503;
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "application/json");
    }
    if (!response.writableEnded) {
      response.end(JSON.stringify({ status: ready ? "ready" : "not_ready" }));
    }
  };
}
