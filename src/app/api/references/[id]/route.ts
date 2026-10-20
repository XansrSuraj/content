import { getDb } from "@/lib/db/client";
import { apiError, json, requireApiUser } from "@/lib/api";
import { deleteMyReference } from "@/lib/repo/sports";

export async function DELETE(req: Request, ctx: RouteContext<"/api/references/[id]">) {
  const user = await requireApiUser(req);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const ok = await deleteMyReference(await getDb(), user.id, id);
  return ok ? json({ ok: true }) : apiError(404, "not_found", "Reference not found.");
}
