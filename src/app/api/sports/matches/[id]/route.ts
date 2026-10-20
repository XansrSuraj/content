import { getDb } from "@/lib/db/client";
import { apiError, json, requireApiUser } from "@/lib/api";
import { getMatch } from "@/lib/repo/sports";
import { snapshot } from "@/lib/services/sports-context";

/** Current verified stage of a match — used to warn when a caption's match context has changed since it was written. */
export async function GET(req: Request, ctx: RouteContext<"/api/sports/matches/[id]">) {
  const user = await requireApiUser(req);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const m = await getMatch(await getDb(), user.id, id);
  if (!m) return apiError(404, "not_found", "Match not found.");
  return json({ match: snapshot(m, new Date()) });
}
