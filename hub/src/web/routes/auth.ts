import { Hono } from "hono";
import {
  verifyPassword,
  createSession,
  destroySession,
  isValidSession,
  buildSessionCookie,
  buildClearSessionCookie,
} from "../middleware/auth.js";

export interface AuthRoutesOptions {
  passwordHash?: string;
  isHttps?: boolean;
  caCert?: Buffer;
}

export function createAuthRoutes(opts: AuthRoutesOptions): Hono {
  const app = new Hono();

  app.get("/auth/status", (c) => {
    const authRequired = !!opts.passwordHash;
    let authenticated = !authRequired;

    if (authRequired) {
      const cookie = c.req.header("cookie");
      const match = cookie?.match(/(?:^|;\s*)omnideck_session=([^;]*)/);
      const token = match?.[1];
      authenticated = !!token && isValidSession(token);
    }

    return c.json({ auth_required: authRequired, authenticated });
  });

  app.post("/auth/login", async (c) => {
    if (!opts.passwordHash) {
      return c.json({ ok: true });
    }

    const body = await c.req.json<{ password?: string }>();
    if (!body.password) {
      return c.json({ error: "Password required" }, 400);
    }

    const valid = await verifyPassword(body.password, opts.passwordHash);
    if (!valid) {
      return c.json({ error: "Invalid password" }, 401);
    }

    const token = createSession();
    c.header("Set-Cookie", buildSessionCookie(token, { secure: opts.isHttps }));
    return c.json({ ok: true });
  });

  app.post("/auth/logout", (c) => {
    const cookie = c.req.header("cookie");
    const match = cookie?.match(/(?:^|;\s*)omnideck_session=([^;]*)/);
    const token = match?.[1];
    if (token) destroySession(token);
    c.header("Set-Cookie", buildClearSessionCookie());
    return c.json({ ok: true });
  });

  // CA certificate download — always accessible
  app.get("/tls/ca.crt", (c) => {
    if (!opts.caCert) {
      return c.json({ error: "TLS not configured" }, 404);
    }
    c.header("Content-Type", "application/x-x509-ca-cert");
    c.header("Content-Disposition", 'attachment; filename="omnideck-ca.crt"');
    return c.body(opts.caCert.toString());
  });

  return app;
}
