import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { config } from "@/lib/config";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function apiError(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return json({ error: { code, message, ...extra } }, status);
}

/**
 * Same-origin check for cookie-authenticated mutations (defence in depth on
 * top of SameSite=Lax cookies). Requests without an Origin header (non-browser
 * clients) must still present a valid session cookie.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (host && o.host === host) return true;
    return o.origin === new URL(config().appUrl).origin;
  } catch {
    return false;
  }
}

type Handler<T> = (user: SessionUser, body: T) => Promise<Response>;

/** Wraps a mutation: origin check, session auth, body size cap and zod validation. */
export function mutation<S extends z.ZodType>(schema: S, handler: Handler<z.infer<S>>, maxBytes = 32_000) {
  return async (req: Request) => {
    if (!sameOrigin(req)) return apiError(403, "bad_origin", "Cross-site request blocked.");
    const user = await getCurrentUser();
    if (!user) return apiError(401, "unauthenticated", "Please sign in again.");
    const raw = await req.text();
    if (raw.length > maxBytes) return apiError(413, "too_large", "Request is too large.");
    let body: unknown = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return apiError(400, "bad_json", "Invalid JSON.");
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return apiError(400, "invalid", "Invalid request.", { issues: parsed.error.issues.slice(0, 5).map((i) => i.path.join(".")) });
    return handler(user, parsed.data);
  };
}

export async function requireApiUser(req?: Request): Promise<SessionUser | Response> {
  if (req && req.method !== "GET" && !sameOrigin(req)) return apiError(403, "bad_origin", "Cross-site request blocked.");
  const user = await getCurrentUser();
  return user ?? apiError(401, "unauthenticated", "Please sign in again.");
}
