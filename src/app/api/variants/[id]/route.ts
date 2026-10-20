import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { apiError, json, requireApiUser } from "@/lib/api";
import { dedupeHashtags } from "@/lib/domain/hashtags";
import { recordEvent } from "@/lib/repo/creator";
import { deleteVariant, updateVariant } from "@/lib/repo/studio";
import { unsaveItem } from "@/lib/repo/work";

const Patch = z.object({
  text: z.string().trim().min(1).max(2200).optional(),
  hashtags: z.array(z.string().max(60)).max(30).optional(),
});

export async function PATCH(req: Request, ctx: RouteContext<"/api/variants/[id]">) {
  const user = await requireApiUser(req);
  if (user instanceof Response) return user;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "invalid", "Invalid edit.");
  const { id } = await ctx.params;
  const db = await getDb();
  const v = await updateVariant(db, user.id, id, {
    text: parsed.data.text,
    hashtags: parsed.data.hashtags ? dedupeHashtags(parsed.data.hashtags) : undefined,
  });
  if (!v) return apiError(404, "not_found", "Caption not found.");
  await recordEvent(db, user.id, "output_edited", { target: "variant", variantId: v.id });
  return json({ id: v.id, text: v.text, hashtags: v.hashtags, edited: v.edited });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/variants/[id]">) {
  const user = await requireApiUser(req);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const db = await getDb();
  const ok = await deleteVariant(db, user.id, id);
  if (!ok) return apiError(404, "not_found", "Caption not found.");
  await unsaveItem(db, user.id, "variant", id);
  return json({ deleted: true });
}
