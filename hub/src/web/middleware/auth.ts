import { randomBytes } from "node:crypto";
import { compare } from "bcryptjs";
import type { Context, Next } from "hono";
import { createLogger } from "../../logger.js";

const log = createLogger("auth");

/** In-memory session store (sessions clear on hub restart — acceptable for local appliance). */
const sessions = new Map<string, { createdAt: Date }>();

/** Routes that bypass auth even when a password is configured. */
const PUBLIC_PATHS = [
  "/api/auth/login",
  "/api/auth/status",
  "/api/health",
  "/api/tls/ca.crt",
];

/** Path prefixes that bypass auth — used for Wi-Fi setup when the hub is in AP mode. */
const PUBLIC_PREFIXES = [
  "/api/setup/",
  "/setup",
];

const SESSION_COOKIE = "omnideck_session";

export interface AuthMiddlewareOptions {
  passwordHash: string;
  isHttps?: boolean;
}

/**
 * Create Hono middleware that enforces password authentication via session cookies.
 * If no passwordHash is configured, the middleware should not be mounted.
 */
export function createAuthMiddleware(opts: AuthMiddlewareOptions) {
  return async (c: Context, next: Next) => {
    // Allow public paths through
    if (PUBLIC_PATHS.some((p) => c.req.path === p)) {
      return next();
    }
    if (PUBLIC_PREFIXES.some((p) => c.req.path.startsWith(p))) {
      return next();
    }

    // Allow static assets needed for the login page
    if (
      c.req.path.endsWith(".js") ||
      c.req.path.endsWith(".css") ||
      c.req.path.endsWith(".ico") ||
      c.req.path.endsWith(".woff2") ||
      c.req.path.endsWith(".svg")
    ) {
      return next();
    }

    // Check session cookie
    const sessionToken = getCookie(c, SESSION_COOKIE);
    if (sessionToken && sessions.has(sessionToken)) {
      return next();
    }

    // For API requests, return 401
    if (c.req.path.startsWith("/api/")) {
      return c.json({ error: "Authentication required" }, 401);
    }

    // For page requests, let the SPA handle it (it will check /api/auth/status and show login)
    return next();
  };
}

/** Verify a password against the stored hash. */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return compare(password, hash);
}

/** Create a new session and return the token. */
export function createSession(): string {
  const token = randomBytes(32).toString("hex");
  sessions.set(token, { createdAt: new Date() });
  return token;
}

/** Destroy a session. */
export function destroySession(token: string): void {
  sessions.delete(token);
}

/** Check if a session is valid. */
export function isValidSession(token: string): boolean {
  return sessions.has(token);
}

/** Build Set-Cookie header value. */
export function buildSessionCookie(
  token: string,
  opts?: { secure?: boolean },
): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
  ];
  if (opts?.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Build a cookie-clearing header value. */
export function buildClearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

/** Extract a cookie value from the request. */
function getCookie(c: Context, name: string): string | undefined {
  const header = c.req.header("cookie");
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1];
}
