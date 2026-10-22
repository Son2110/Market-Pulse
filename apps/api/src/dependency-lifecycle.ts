// Compatibility exports for existing callers; new wiring imports the owning platform module.
export * from "./platform/health/dependency-probes.js";
export * from "./platform/recovery/reconciliation.js";
export * from "./platform/recovery/redis-lifecycle.js";
export * from "./platform/dependencies/dependency-status.js";

export interface CapabilityStateInput {
  shuttingDown: boolean;
  startupComplete: boolean;
  fixtureInitialized: boolean;
  mongoInitialized: boolean;
  ingestionSecretConfigured: boolean;
  ingestionInitialized: boolean;
  mongoProbe: () => Promise<boolean>;
  redisProbe: () => Promise<boolean>;
}

export async function evaluateFullReadiness(state: CapabilityStateInput): Promise<boolean> {
  if (state.shuttingDown || !state.startupComplete) return false;
  if (!state.fixtureInitialized || !state.mongoInitialized) return false;
  const [mongoReady, redisReady] = await Promise.all([state.mongoProbe(), state.redisProbe()]);
  return Boolean(mongoReady && redisReady);
}

export function evaluateFixtureReadiness(
  state: Pick<CapabilityStateInput, "shuttingDown" | "startupComplete" | "fixtureInitialized">,
): boolean {
  return Boolean(!state.shuttingDown && state.startupComplete && state.fixtureInitialized);
}

export async function evaluateMongoCapabilityReadiness(
  state: Pick<CapabilityStateInput, "shuttingDown" | "startupComplete" | "mongoInitialized" | "mongoProbe">,
): Promise<boolean> {
  if (state.shuttingDown || !state.startupComplete || !state.mongoInitialized) return false;
  return Boolean(await state.mongoProbe());
}

export async function evaluateIngestionCapabilityReadiness(
  state: Pick<
    CapabilityStateInput,
    "shuttingDown" | "startupComplete" | "ingestionSecretConfigured" | "ingestionInitialized" | "mongoProbe"
  >,
): Promise<boolean> {
  if (
    state.shuttingDown
    || !state.startupComplete
    || !state.ingestionSecretConfigured
    || !state.ingestionInitialized
  ) {
    return false;
  }
  return Boolean(await state.mongoProbe());
}
