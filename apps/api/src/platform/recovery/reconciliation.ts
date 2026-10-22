import { createExecutionContext, probeContextStorage, waitForAllSettled, withinTimeout } from "../health/dependency-probes.js";

export interface ReconciliationCoordinatorOptions {
  intervalMs: number;
  timeoutMs: number;
  runReconcile: () => Promise<void>;
  onError?: () => void;
  onStart?: () => void;
  onSuccess?: () => void;
  now?: () => number;
}

export interface ReconciliationCoordinator {
  reconcile(): Promise<void>;
  isHealthy(): boolean;
  readonly inFlight: boolean;
  markStopped(): void;
  close(drainTimeoutMs?: number): Promise<void>;
}

export function createReconciliationCoordinator(
  options: ReconciliationCoordinatorOptions,
): ReconciliationCoordinator {
  const now = options.now ?? Date.now;
  const boundedTimeoutMs = Math.max(1, Math.trunc(options.timeoutMs));
  let closing = false;
  let initialized = false;
  let lastReconciled = 0;
  let activeCallerPromise: Promise<void> | undefined;
  let activeSettlement: Promise<void> | undefined;

  const reconcile = (): Promise<void> => {
    if (closing) return Promise.resolve();
    if (activeSettlement) {
      return activeCallerPromise ?? Promise.resolve();
    }

    const executionContext = createExecutionContext();
    options.onStart?.();
    let settledWithinBudget = false;
    let errorReported = false;
    let timer: NodeJS.Timeout | undefined;

    const reportError = (): void => {
      lastReconciled = 0;
      if (!errorReported) {
        errorReported = true;
        options.onError?.();
      }
    };

    executionContext.onTimeoutCallbacks.add(() => {
      if (!settledWithinBudget) {
        reportError();
      }
    });

    let rawPromise: Promise<void>;
    try {
      rawPromise = probeContextStorage.run(executionContext, () =>
        Promise.resolve().then(() => options.runReconcile()),
      );
    } catch {
      reportError();
      return Promise.resolve();
    }

    const outcomePromise = rawPromise.then(
      () => {
        if (executionContext.timedOut) {
          reportError();
          return;
        }
        settledWithinBudget = true;
        if (!closing) {
          lastReconciled = now();
          initialized = true;
          options.onSuccess?.();
        }
      },
      () => {
        if (executionContext.timedOut) {
          reportError();
          return;
        }
        settledWithinBudget = true;
        reportError();
      },
    );

    activeSettlement = waitForAllSettled(
      outcomePromise.then(
        () => undefined,
        () => undefined,
      ),
      executionContext.settlements,
    ).finally(() => {
      activeSettlement = undefined;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    });

    const timeoutPromise = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        if (!settledWithinBudget) {
          executionContext.markTimedOut();
          reportError();
        }
        resolve();
      }, boundedTimeoutMs);
    });

    activeCallerPromise = Promise.race([outcomePromise, timeoutPromise]).finally(() => {
      activeCallerPromise = undefined;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    });

    return activeCallerPromise;
  };

  return {
    reconcile,
    isHealthy(): boolean {
      if (closing || !initialized || lastReconciled === 0) return false;
      return now() - lastReconciled <= options.intervalMs * 3;
    },
    get inFlight(): boolean {
      return activeSettlement !== undefined;
    },
    markStopped(): void {
      initialized = false;
      lastReconciled = 0;
    },
    async close(drainTimeoutMs = 1500): Promise<void> {
      closing = true;
      lastReconciled = 0;
      if (activeSettlement) {
        const pendingSettlement = activeSettlement;
        await withinTimeout(() => pendingSettlement, drainTimeoutMs, "reconcile_close_timeout").catch(
          () => undefined,
        );
      }
    },
  };
}
