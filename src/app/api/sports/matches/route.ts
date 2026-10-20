import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { json, mutation } from "@/lib/api";
import { teamIdForName } from "@/lib/domain/sports/entities";
import { parseSportsIntent } from "@/lib/domain/sports/intent";
import { zonedToUtc } from "@/lib/providers/sports/connectors";
import { addCreatorMatch } from "@/lib/repo/sports";
import { snapshot } from "@/lib/services/sports-context";

const AddMatch = z.object({
  sport: z.enum(["cricket", "football"]),
  home: z.string().trim().min(2).max(60),
  away: z.string().trim().min(2).max(60),
  competition: z.string().trim().max(80).default(""),
  gender: z.enum(["men", "women"]).default("men"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/).default("19:30"),
  timezone: z.string().max(60).default("Asia/Kolkata"),
  status: z.enum(["scheduled", "finished", "postponed", "cancelled"]).default("scheduled"),
  result: z.string().trim().max(160).default(""),
});

const idFor = (name: string, sport: "cricket" | "football") =>
  teamIdForName(name, sport) ?? parseSportsIntent(`${name} ${sport} match`).teamIds.find((id) => id.startsWith(`${sport}:`)) ?? null;

/** A creator types in the match their video is about. Private to them and labelled "entered by you". */
export const POST = mutation(AddMatch, async (user, b) => {
  let startsAt: Date;
  try {
    startsAt = zonedToUtc(b.date, b.time, b.timezone);
  } catch {
    startsAt = zonedToUtc(b.date, b.time, "Asia/Kolkata");
  }
  const db = await getDb();
  const m = await addCreatorMatch(db, user.id, {
    sport: b.sport,
    competition: b.competition || (b.sport === "cricket" ? "Cricket match" : "Football match"),
    gender: b.gender,
    homeTeamId: idFor(b.home, b.sport),
    awayTeamId: idFor(b.away, b.sport),
    homeName: b.home,
    awayName: b.away,
    startsAt,
    status: b.status,
    resultSummary: b.status === "finished" && b.result ? b.result : null,
    url: null,
  });
  return json({ match: snapshot(m, new Date()) });
});
