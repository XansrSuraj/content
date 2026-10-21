import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { getMatch } from "@/lib/repo/sports";
import { snapshot, upcomingMatches } from "@/lib/services/sports-context";
import { getServerDict } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui";
import { GraphicMaker } from "./graphic-maker";

export async function generateMetadata() {
  const { d } = await getServerDict();
  return { title: d.graphics.title };
}

export default async function GraphicsPage(props: PageProps<"/app/graphics">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const db = await getDb();
  const [upcoming, { d }] = await Promise.all([upcomingMatches(db, user.id, { days: 7, limit: 40 }), getServerDict()]);
  // A match opened from its content plan may already be over (result card): include it.
  const requested = typeof sp.match === "string" ? await getMatch(db, user.id, sp.match) : null;
  const matches = requested && !upcoming.some((m) => m.id === requested.id) ? [snapshot(requested, new Date()), ...upcoming] : upcoming;
  return (
    <div>
      <PageHeader title={d.graphics.title} subtitle={d.graphics.lead} />
      <GraphicMaker matches={matches} initialMatchId={requested?.id ?? null} />
    </div>
  );
}
