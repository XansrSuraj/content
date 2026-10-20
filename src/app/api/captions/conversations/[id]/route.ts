import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { apiError, json, requireApiUser, sameOrigin } from "@/lib/api";
import { deleteConversation, updateConversation } from "@/lib/repo/studio";
import { getCurrentUser } from "@/lib/auth/session";

const Rename = z.object({ title: z.string().trim().min(1).max(120) });

export async function PATCH(req: Request, ctx: RouteContext<"/api/captions/conversations/[id]">) {
  if (!sameOrigin(req)) return apiError(403, "bad_origin", "Cross-site request blocked.");
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthenticated", "Please sign in again.");
  const parsed = Rename.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "invalid", "Title must be 1–120 characters.");
  const { id } = await ctx.params;
  const db = await getDb();
  const conv = await updateConversation(db, user.id, id, { title: parsed.data.title });
  if (!conv) return apiError(404, "not_found", "Conversation not found.");
  return json({ id: conv.id, title: conv.title });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/captions/conversations/[id]">) {
  const user = await requireApiUser(req);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const db = await getDb();
  const ok = await deleteConversation(db, user.id, id);
  if (!ok) return apiError(404, "not_found", "Conversation not found.");
  return json({ deleted: true });
}
