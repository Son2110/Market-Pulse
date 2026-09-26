export interface ApiConfig {
  port: number;
  host: string;
  mongoUrl: string;
  redisUrl: string;
  connectAttempts: number;
  connectDelayMs: number;
  dependencyTimeoutMs: number;
}

function integerSetting(name: string, value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Invalid ${name} configuration.`);
  }
  return parsed;
}

function urlSetting(name: string, value: string | undefined, fallback: string, protocols: string[]): string {
  const candidate = value ?? fallback;
  try {
    const parsed = new URL(candidate);
    if (!protocols.includes(parsed.protocol)) throw new Error();
  } catch {
    throw new Error(`Invalid ${name} configuration.`);
  }
  return candidate;
}

function hostSetting(value: string | undefined): string {
  const candidate = value ?? "127.0.0.1";
  if (!/^[a-zA-Z0-9.:-]+$/.test(candidate)) throw new Error("Invalid HOST configuration.");
  return candidate;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    port: integerSetting("PORT", env.PORT, 3001, 1, 65535),
    host: hostSetting(env.HOST),
    mongoUrl: urlSetting("MONGODB_URL", env.MONGODB_URL, "mongodb://127.0.0.1:27017/marketpulse", ["mongodb:", "mongodb+srv:"]),
    redisUrl: urlSetting("REDIS_URL", env.REDIS_URL, "redis://127.0.0.1:6379", ["redis:", "rediss:"]),
    connectAttempts: integerSetting("CONNECT_ATTEMPTS", env.CONNECT_ATTEMPTS, 5, 1, 10),
    connectDelayMs: integerSetting("CONNECT_DELAY_MS", env.CONNECT_DELAY_MS, 500, 0, 5000),
    dependencyTimeoutMs: integerSetting("DEPENDENCY_TIMEOUT_MS", env.DEPENDENCY_TIMEOUT_MS, 1000, 100, 10000),
  };
}
