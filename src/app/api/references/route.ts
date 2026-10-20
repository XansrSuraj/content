import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { json, mutation, requireApiUser } from "@/lib/api";
import { addReferences, listMyReferences } from "@/lib/repo/sports";

const AddReference = z.object({
  platform: z.enum(["instagram", "youtube", "tiktok", "facebook", "reddit", "x", "other"]),
  topic: z.string().trim().min(2).max(120),
  url: z
    .string()
    .trim()
    .max(500)
    .url()
    .refine((u) => /^https?:\/\//i.test(u), "http(s) only")
    .nullable()
    .default(null),
  note: z.string().trim().max(300).default(""),
});

/**
 * A creator pastes a Reel, audio or trend they saw. Stored as a "creator-provided
 * reference": a pasted link is never treated as verification.
 */
export const POST = mutation(AddReference, async (user, b) => {
  const db = await getDb();
  await addReferences(db, user.id, [
    { platform: b.platform, topic: b.topic, url: b.url, note: b.note, observedAt: new Date(), evidenceType: "creator_reference", sourceTool: "creator" },
  ]);
  return json({ ok: true });
});

export async function GET(req: Request) {
  const user = await requireApiUser(req);
  if (user instanceof Response) return user;
  const rows = await listMyReferences(await getDb(), user.id);
  return json({
    references: rows.map((r) => ({ id: r.id, platform: r.platform, topic: r.topic, url: r.url, note: r.note, observedAt: r.observedAt.toISOString() })),
  });
}
