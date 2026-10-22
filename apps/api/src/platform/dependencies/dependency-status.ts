const MONGO_DEPENDENCY_ERROR_NAMES = new Set([
  "MongoNetworkError",
  "MongoNetworkTimeoutError",
  "MongoServerSelectionError",
  "MongoTopologyClosedError",
  "MongoNotConnectedError",
  "MongoExpiredSessionError",
  "MongoClientClosedError",
  "MongoWaitQueueTimeoutError",
  "DependencyTimeoutError",
]);

export function isMongoDependencyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (MONGO_DEPENDENCY_ERROR_NAMES.has(error.name)) return true;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "number" && (code === 11000 || code === 121)) {
    return false;
  }
  return /Server selection timed out|Topology is closed|Client must be connected|connection .* closed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket .* closed/i.test(
    error.message,
  );
}

export interface DependencyHealthTracker {
  markMongo(ready: boolean): void;
  markRedis(ready: boolean): void;
  isMongoHealthy(): boolean;
  isRedisHealthy(): boolean;
}

export function createDependencyHealthTracker(
  initial: { mongo?: boolean; redis?: boolean } = {},
  onTransition?: (service: "mongodb" | "redis", ready: boolean) => void,
): DependencyHealthTracker {
  let mongoHealthy = Boolean(initial.mongo);
  let redisHealthy = Boolean(initial.redis);
  return {
    markMongo(ready: boolean): void {
      if (mongoHealthy !== Boolean(ready)) onTransition?.("mongodb", Boolean(ready));
      mongoHealthy = Boolean(ready);
    },
    markRedis(ready: boolean): void {
      if (redisHealthy !== Boolean(ready)) onTransition?.("redis", Boolean(ready));
      redisHealthy = Boolean(ready);
    },
    isMongoHealthy(): boolean {
      return mongoHealthy;
    },
    isRedisHealthy(): boolean {
      return redisHealthy;
    },
  };
}
