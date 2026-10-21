import Link from "next/link";
import { ArrowLeft, CalendarPlus, Image as ImageIcon, PenLine } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { getMatch } from "@/lib/repo/sports";
import { snapshot } from "@/lib/services/sports-context";
import { contentPlan, fixtureHashtags } from "@/lib/domain/sports/content-plan";
import { COMPETITION_BY_ID, TEAM_BY_ID, sameTeamName } from "@/lib/domain/sports/entities";
import { standingsForCompetition } from "@/lib/repo/standings";
import { StandingsTable } from "@/components/standings-table";
import { getServerDict } from "@/lib/i18n/server";
import { MatchLine } from "@/app/app/caption-studio/sports-panel";
import { CopyButton } from "@/components/copy-button";
import { Badge, Card, EmptyState, LinkButton, buttonClass, cx, formatDateTime } from "@/components/ui";

export async function generateMetadata() {
  const { d } = await getServerDict();
  return { title: d.matchPlan.planTitle };
}

export default async function MatchPage(props: PageProps<"/app/matches/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const db = await getDb();
  const [m, { lang, d }] = await Promise.all([getMatch(db, user.id, id), getServerDict()]);
  const t = d.matchPlan;
  const back = (
    <Link href="/app/trending" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
      <ArrowLeft aria-hidden className="h-4 w-4" />
      {t.back}
    </Link>
  );
  if (!m) {
    return (
      <div>
        {back}
        <EmptyState title={t.notFound}>{d.trending.matchesEmpty}</EmptyState>
      </div>
    );
  }

  const now = new Date();
  const snap = snapshot(m, now);
  const plan = contentPlan({ sport: m.sport, startsAt: m.startsAt, stage: snap.stage }, now);
  const comp = m.competitionId ? COMPETITION_BY_ID.get(m.competitionId) : undefined;
  const table = m.competitionId ? await standingsForCompetition(db, m.competitionId) : null;
  const teamRows = table ? [m.homeName, m.awayName].map((n) => table.rows.find((r) => sameTeamName(r.team, n))).filter((r) => r !== undefined) : [];
  const tags = fixtureHashtags({
    sport: m.sport,
    homeShort: m.homeTeamId ? TEAM_BY_ID.get(m.homeTeamId)?.short.replace(/-W$/, "W") : null,
    awayShort: m.awayTeamId ? TEAM_BY_ID.get(m.awayTeamId)?.short.replace(/-W$/, "W") : null,
    homeName: m.homeName,
    awayName: m.awayName,
    competitionTag: comp ? (comp.aliases[0].length <= 4 ? comp.aliases[0].toUpperCase() : null) : null,
  });

  return (
    <div className="max-w-4xl">
      {back}
      <Card className="p-5">
        <MatchLine m={snap} />
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`/api/sports/matches/${m.id}/ics`} className={buttonClass("secondary", "sm")}>
            <CalendarPlus aria-hidden className="h-3.5 w-3.5" />
            {t.addCalendar}
          </a>
          <LinkButton href={`/app/graphics?match=${m.id}`} size="sm" variant="secondary">
            <ImageIcon aria-hidden className="h-3.5 w-3.5" />
            {t.makeGraphic}
          </LinkButton>
        </div>
      </Card>

      <section className="mt-8" aria-labelledby="plan-title">
        <h1 id="plan-title" className="text-xl font-bold tracking-tight">
          {t.planTitle}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{t.planLead}</p>
        <ol className="mt-4 space-y-3">
          {plan.map((s) => {
            const step = t.steps[s.key];
            const waits = (s.key === "fulltime" || s.key === "analysis") && snap.stage !== "completed";
            return (
              <li key={s.key}>
                <Card className={cx("flex flex-col gap-3 p-4 sm:flex-row sm:items-center", s.current && "border-brand bg-brand-soft/30", s.past && "opacity-70")}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{step.t}</h2>
                      {s.current && <Badge tone="brand">{t.now}</Badge>}
                      {s.past && <Badge>{t.passed}</Badge>}
                      {waits && !s.past && <Badge tone="warn">{t.waitsForResult}</Badge>}
                      <span className="text-xs text-muted">{formatDateTime(s.at, lang)}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">{step.d}</p>
                  </div>
                  <LinkButton href={`/app/caption-studio?match=${m.id}&step=${s.key}`} size="sm" variant={s.current ? "primary" : "secondary"}>
                    <PenLine aria-hidden className="h-3.5 w-3.5" />
                    {t.writeCaption}
                  </LinkButton>
                </Card>
              </li>
            );
          })}
        </ol>
      </section>

      {table && teamRows.length > 0 && (
        <section className="mt-8" aria-labelledby="table-title">
          <h2 id="table-title" className="text-lg font-semibold">
            {d.standings.matchTitle}
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {teamRows.map((r) => (
              <li key={r.team}>{d.standings.position(r.team, r.position, r.points, r.played)}</li>
            ))}
          </ul>
          <details className="mt-3 rounded-xl border border-line bg-surface p-4">
            <summary className="cursor-pointer text-sm font-semibold">{table.competitionName}</summary>
            <div className="mt-3">
              <StandingsTable rows={table.rows} cols={d.standings.cols} highlight={teamRows.map((r) => r.team)} />
            </div>
          </details>
          <p className="mt-2 text-xs text-muted">{d.standings.source(formatDateTime(table.fetchedAt, lang))}</p>
        </section>
      )}

      <section className="mt-8" aria-labelledby="tags-title">
        <h2 id="tags-title" className="text-lg font-semibold">
          {t.hashtagsTitle}
        </h2>
        <p className="mt-1 text-sm text-muted">{t.hashtagsNote}</p>
        <Card className="mt-3 flex flex-wrap items-center gap-2 p-4">
          {tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
          <span className="ml-auto">
            <CopyButton text={tags.join(" ")} label={t.copyHashtags} />
          </span>
        </Card>
      </section>
    </div>
  );
}
