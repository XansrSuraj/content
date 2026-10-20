import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";
import { config } from "@/lib/config";
import { hashToken, newSessionToken } from "./password";

export const SESSION_COOKIE = "ts_session";
const SESSION_DAYS = 30;
const DEMO_SESSION_DAYS = 2;

export interface SessionUser {
  id: string;
  email: string;
  role: "creator" | "admin";
  isDemo: boolean;
}

export async function createSession(userId: string, isDemo: boolean): Promise<void> {
  const db = await getDb();
  const token = newSessionToken();
  const days = isDemo ? DEMO_SESSION_DAYS : SESSION_DAYS;
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config().isProduction,
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string): Promise<void> {
  const db = await getDb();
  await db.delete(sessions).where(eq(sessions.userId, userId));
  (await cookies()).delete(SESSION_COOKIE);
}

/** Resolves identity from the session cookie only — never from request bodies. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const rows = await db
    .select({ id: users.id, email: users.email, role: users.role, isDemo: users.isDemo })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const user = rows[0];
  if (!user) return null;
  // Demo identities stop working the moment demo mode is turned off.
  if (user.isDemo && !config().demoEnabled) return null;
  return user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin" || user.isDemo) redirect("/app");
  return user;
}
