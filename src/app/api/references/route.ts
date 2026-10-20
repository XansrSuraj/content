import { getDb } from "@/lib/db/client";
import { json, mutation, requireApiUser } from "@/lib/api";
import { addReferences, listMyReferences } from "@/lib/repo/sports";
import { CreatorReferenceInput } from "@/lib/domain/references";

const AddReference = CreatorReferenceInput;

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
