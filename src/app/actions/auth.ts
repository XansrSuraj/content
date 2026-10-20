"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { config } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { consumeLimit } from "@/lib/security/rate-limit";
import { createDemoUser } from "@/lib/demo/seed";
import { getProfile } from "@/lib/repo/creator";

export interface AuthState {
  error?: string;
}

const Credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10, "Password must be at least 10 characters.").max(200),
});

async function clientIp(): Promise<string> {
  const h = await headers();
  // Only meaningful behind a trusted proxy that sets this header; see README.
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

async function authLimited(): Promise<boolean> {
  const db = await getDb();
  const res = await consumeLimit(db, `auth:${await clientIp()}`, config().limits.authPerIpPer15Min, 15 * 60_000);
  return !res.allowed;
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (await authLimited()) return { error: "Too many attempts. Please wait a few minutes." };
  const parsed = Credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid details." };
  const db = await getDb();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (existing.length) return { error: "An account with this email already exists. Please sign in." };
  const role = config().adminEmails.includes(parsed.data.email) ? "admin" : "creator";
  const [user] = await db
    .insert(users)
    .values({ email: parsed.data.email, passwordHash: await hashPassword(parsed.data.password), role })
    .returning();
  await createSession(user.id, false);
  redirect("/onboarding");
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (await authLimited()) return { error: "Too many attempts. Please wait a few minutes." };
  const parsed = Credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Email or password is incorrect." };
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? null);
  if (!user || !ok || user.isDemo) return { error: "Email or password is incorrect." };
  // Keep admin role in sync with ADMIN_EMAILS (grant and revoke).
  const shouldBeAdmin = config().adminEmails.includes(user.email);
  if ((user.role === "admin") !== shouldBeAdmin) {
    await db.update(users).set({ role: shouldBeAdmin ? "admin" : "creator" }).where(eq(users.id, user.id));
  }
  await createSession(user.id, false);
  const profile = await getProfile(db, user.id);
  redirect(profile?.onboardedAt ? "/app" : "/onboarding");
}

export async function startDemo(): Promise<void> {
  if (!config().demoEnabled) redirect("/signin?demo=unavailable");
  if (await authLimited()) redirect("/signin?error=rate");
  const db = await getDb();
  const userId = await createDemoUser(db);
  await createSession(userId, true);
  redirect("/onboarding?demo=1");
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/");
}
