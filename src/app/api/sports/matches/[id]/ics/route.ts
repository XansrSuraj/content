import { getDb } from "@/lib/db/client";
import { apiError, requireApiUser } from "@/lib/api";
import { fixtureIcs } from "@/lib/domain/sports/content-plan";
import { getMatch } from "@/lib/repo/sports";
import { SOURCE_NAMES } from "@/lib/providers/trends/catalog";

/** The fixture as a calendar event (with a reminder a day before, to post the preview). */
export async function GET(req: Request, ctx: RouteContext<"/api/sports/matches/[id]/ics">) {
  const user = await requireApiUser(req);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const m = await getMatch(await getDb(), user.id, id);
  if (!m) return apiError(404, "not_found", "Match not found.");
  const body = fixtureIcs({ ...m, source: m.statusSource === "creator" ? "you" : (SOURCE_NAMES[m.provider] ?? m.provider) }, new Date());
  const file = `${m.homeName}-vs-${m.awayName}`.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60);
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file)}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
