export type CapabilityStatus = "ready" | "unavailable" | "disabled" | "unknown";

export interface CapabilityInputs {
  fixtureReady: boolean;
  mongoInitialized: boolean;
  mongoReady: boolean;
  redisReady: boolean;
  queueReady: boolean;
  observedEnabled: boolean;
  goldEnabled: boolean;
  ingestionEnabled: boolean;
  ingestionInitialized: boolean;
  shuttingDown: boolean;
}

// Policy receives observations only; probes and HTTP remain in their adapters.
export function capabilitySnapshot(input: CapabilityInputs) {
  const active = !input.shuttingDown;
  const state = (enabled: boolean, ready: boolean): CapabilityStatus =>
    !enabled ? "disabled" : active && ready ? "ready" : "unavailable";
  const mongo = input.mongoInitialized && input.mongoReady;
  const ingestion = mongo && input.ingestionInitialized;
  const fullReady = active && input.fixtureReady && mongo && input.redisReady
    && (!input.ingestionEnabled || ingestion && input.queueReady);
  return {
    status: fullReady ? "ready" : "degraded",
    capabilities: {
      fixtureRead: state(true, input.fixtureReady),
      account: state(true, mongo),
      watchlist: state(true, mongo && input.fixtureReady),
      observedRead: state(input.observedEnabled, mongo),
      goldRead: state(input.goldEnabled, mongo),
      ingestionAcceptance: state(input.ingestionEnabled, ingestion),
      queueDispatch: state(input.ingestionEnabled, input.queueReady),
      // Only the worker process can attest running state and recent reconciliation.
      worker: "unknown" as CapabilityStatus,
    },
  };
}
