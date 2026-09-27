import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import express, { type NextFunction, type Request, type RequestHandler, type Response, Router } from "express";
import type { Collection, Db, ObjectId, WithId } from "mongodb";

const PASSWORD_MIN_CHARS = 15;
const PASSWORD_MAX_CHARS = 128;
const PASSWORD_MAX_BYTES = 512;
const BODY_LIMIT = "8kb";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const RATE_LIMIT_MAX_KEYS = 1024;
const SCRYPT_N = 1 << 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_BYTES = 32;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_MAXMEM_BYTES = 256 * 1024 * 1024;
const DUMMY_PASSWORD_HASH = `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${Buffer.alloc(SCRYPT_SALT_BYTES).toString("base64url")}$${Buffer.alloc(SCRYPT_KEY_BYTES).toString("base64url")}`;

interface UserRecord {
  email: string;
  passwordHash: string;
  role: "USER";
  createdAt: Date;
}

interface SessionRecord {
  userId: ObjectId;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
}

interface PublicUser {
  id: string;
  email: string;
  role: "USER";
  createdAt: string;
}

export interface AuthOptions {
  db: Db;
  isReady: () => boolean;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  kdfConcurrency: number;
  now?: () => number;
}

export interface AuthApi {
  router: Router;
  authenticate: RequestHandler;
  initialize: () => Promise<void>;
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_BYTES, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAXMEM_BYTES,
    }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const key = await deriveKey(password, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt" || parts[1] !== String(SCRYPT_N) || parts[2] !== String(SCRYPT_R) || parts[3] !== String(SCRYPT_P)) {
    return false;
  }
  const salt = Buffer.from(parts[4] ?? "", "base64url");
  const expected = Buffer.from(parts[5] ?? "", "base64url");
  if (salt.length !== SCRYPT_SALT_BYTES || expected.length !== SCRYPT_KEY_BYTES) return false;
  if (salt.toString("base64url") !== parts[4] || expected.toString("base64url") !== parts[5]) return false;
  const actual = await deriveKey(password, salt);
  return timingSafeEqual(actual, expected);
}

function normalizeEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) return undefined;
  return email;
}

function validPassword(value: unknown): value is string {
  return typeof value === "string"
    && Array.from(value).length >= PASSWORD_MIN_CHARS
    && Array.from(value).length <= PASSWORD_MAX_CHARS
    && Buffer.byteLength(value, "utf8") <= PASSWORD_MAX_BYTES;
}

function parseCredentials(body: unknown): { email: string; password: string } | undefined {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return undefined;
  const fields = Object.keys(body);
  if (fields.some((field) => field !== "email" && field !== "password")) return undefined;
  const input = body as Record<string, unknown>;
  const email = normalizeEmail(input.email);
  if (!email || !validPassword(input.password)) return undefined;
  return { email, password: input.password };
}

function toPublicUser(user: Pick<WithId<UserRecord>, "_id" | "email" | "role" | "createdAt">): PublicUser {
  return {
    id: user._id.toHexString(),
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

function jsonError(response: Response, status: number, error: string): void {
  response.status(status).json({ error });
}

function sendRateLimit(response: Response, retryAfterSeconds: number): void {
  response.setHeader("Retry-After", String(Math.max(1, Math.ceil(retryAfterSeconds))));
  jsonError(response, 429, "rate_limited");
}

function isJsonContentType(request: Request): boolean {
  const value = request.headers["content-type"];
  if (typeof value !== "string") return false;
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json";
}

function requireJson(request: Request, response: Response, next: NextFunction): void {
  if (!isJsonContentType(request)) {
    jsonError(response, 415, "unsupported_media_type");
    return;
  }
  next();
}

class AuthGuards {
  private readonly requests = new Map<string, { count: number; expiresAt: number }>();
  private activeKdf = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKdfConcurrency: number,
    private readonly now: () => number,
  ) {}

  rateLimit = (request: Request, response: Response, next: NextFunction): void => {
    const current = this.now();
    for (const [key, window] of this.requests) {
      if (window.expiresAt <= current) this.requests.delete(key);
    }

    const key = request.socket.remoteAddress ?? "unknown";
    const existing = this.requests.get(key);
    if (!existing) {
      if (this.requests.size >= RATE_LIMIT_MAX_KEYS) {
        sendRateLimit(response, this.windowMs / 1000);
        return;
      }
      this.requests.set(key, { count: 1, expiresAt: current + this.windowMs });
      next();
      return;
    }
    if (existing.count >= this.limit) {
      sendRateLimit(response, (existing.expiresAt - current) / 1000);
      return;
    }
    existing.count += 1;
    next();
  };

  acquireKdf(response: Response): (() => void) | undefined {
    if (this.activeKdf >= this.maxKdfConcurrency) {
      sendRateLimit(response, 1);
      return undefined;
    }
    this.activeKdf += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeKdf -= 1;
    };
  }
}

function bearerToken(request: Request): string | undefined {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string") return undefined;
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/iu.exec(authorization);
  return match?.[1];
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "ascii").digest("hex");
}

function duplicateEmail(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

export function createAuthApi(options: AuthOptions): AuthApi {
  const users: Collection<UserRecord> = options.db.collection("users");
  const sessions: Collection<SessionRecord> = options.db.collection("sessions");
  const now = options.now ?? Date.now;
  const guards = new AuthGuards(options.rateLimitMax, options.rateLimitWindowMs, options.kdfConcurrency, now);
  const router = Router();

  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    if (!options.isReady()) {
      jsonError(response, 503, "not_ready");
      return;
    }
    next();
  });

  router.post("/register", guards.rateLimit, requireJson, express.json({ limit: BODY_LIMIT, strict: false }), async (request, response) => {
    const credentials = parseCredentials(request.body);
    if (!credentials) {
      jsonError(response, 400, "invalid_request");
      return;
    }
    const release = guards.acquireKdf(response);
    if (!release) return;
    let passwordHash: string;
    try {
      passwordHash = await hashPassword(credentials.password);
    } finally {
      release();
    }

    const createdAt = new Date(now());
    const user: UserRecord = { email: credentials.email, passwordHash, role: "USER", createdAt };
    let insertedId: ObjectId;
    try {
      ({ insertedId } = await users.insertOne(user));
    } catch (error) {
      if (duplicateEmail(error)) {
        jsonError(response, 409, "email_already_registered");
        return;
      }
      throw error;
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now() + SESSION_TTL_MS);
    try {
      await sessions.insertOne({ userId: insertedId, tokenHash: tokenHash(token), createdAt, expiresAt });
    } catch (sessionError) {
      try {
        await users.deleteOne({ _id: insertedId });
      } catch (rollbackError) {
        throw new AggregateError([sessionError, rollbackError], "Registration session creation and rollback failed", { cause: sessionError });
      }
      throw sessionError;
    }
    response.status(201).json({ token, tokenType: "Bearer", expiresAt: expiresAt.toISOString(), user: toPublicUser({ _id: insertedId, ...user }) });
  });

  router.post("/login", guards.rateLimit, requireJson, express.json({ limit: BODY_LIMIT, strict: false }), async (request, response) => {
    const credentials = parseCredentials(request.body);
    if (!credentials) {
      jsonError(response, 400, "invalid_request");
      return;
    }
    const release = guards.acquireKdf(response);
    if (!release) return;
    let user: WithId<UserRecord> | null;
    let passwordMatches: boolean;
    try {
      user = await users.findOne({ email: credentials.email });
      passwordMatches = await verifyPassword(credentials.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    } finally {
      release();
    }
    if (!user || !passwordMatches) {
      jsonError(response, 401, "invalid_credentials");
      return;
    }

    const token = randomBytes(32).toString("base64url");
    const createdAt = new Date(now());
    const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);
    await sessions.insertOne({ userId: user._id, tokenHash: tokenHash(token), createdAt, expiresAt });
    response.status(200).json({ token, tokenType: "Bearer", expiresAt: expiresAt.toISOString(), user: toPublicUser(user) });
  });

  const authenticate: RequestHandler = async (request, response, next) => {
    if (!options.isReady()) {
      jsonError(response, 503, "not_ready");
      return;
    }
    const token = bearerToken(request);
    if (!token) {
      jsonError(response, 401, "unauthorized");
      return;
    }
    const session = await sessions.findOne({ tokenHash: tokenHash(token), expiresAt: { $gt: new Date(now()) } });
    if (!session) {
      jsonError(response, 401, "unauthorized");
      return;
    }
    const user = await users.findOne(
      { _id: session.userId },
      { projection: { _id: 1, email: 1, role: 1, createdAt: 1 } },
    );
    if (!user) {
      jsonError(response, 401, "unauthorized");
      return;
    }
    response.locals.authenticatedUser = user;
    response.locals.session = session;
    next();
  };

  router.get("/me", authenticate, (_request, response) => {
    const user = response.locals.authenticatedUser as WithId<UserRecord>;
    response.status(200).json({ user: toPublicUser(user) });
  });

  router.post("/logout", authenticate, async (_request, response) => {
    const session = response.locals.session as WithId<SessionRecord>;
    await sessions.deleteOne({ _id: session._id, expiresAt: { $gt: new Date(now()) } });
    response.status(204).end();
  });

  return {
    router,
    authenticate,
    initialize: async () => {
      await Promise.all([
        users.createIndex({ email: 1 }, { unique: true, name: "email_unique" }),
        sessions.createIndex({ tokenHash: 1 }, { unique: true, name: "token_hash_unique" }),
        sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "session_expiry_ttl" }),
      ]);
    },
  };
}
