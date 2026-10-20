import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { CONFIDENCE_COPY } from "@/lib/domain/opportunities";
import { CATEGORIES, LANGUAGES, REGIONS, labelFor } from "@/lib/domain/options";
import { getPlatform } from "@/lib/domain/platforms";
import { SOURCES, SOURCE_NAMES } from "@/lib/providers/trends/catalog";
import { getOpportunityDetail } from "@/lib/services/discovery";
import { rejectOpportunity, toggleSaveOpportunity } from "@/app/actions/work";
import { Badge, Button, Card, Input, LinkButton, Notice, buttonClass, formatDate, formatDateTime } from "@/components/ui";
import { FreshnessLabel } from "@/components/opportunity-card";

export const metadata = { title: "Opportunity" };

export default async function OpportunityDetail(props: PageProps<"/app/opportunities/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const db = await getDb();
  const d = await getOpportunityDetail(db, user, id);
  if (!d) notFound();
  const o = d.opportunity;
  const save = toggleSaveOpportunity.bind(null, o.id, d.saved);
  const reject = rejectOpportunity.bind(null, o.id);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/app/opportunities" className="text-sm text-brand">
        ← All opportunities
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {o.isDemo && <Badge tone="accent">Demo sample — not real data</Badge>}
        <Badge tone="brand">{o.kind}</Badge>
        {o.categories.map((c) => (
          <Badge key={c}>{CATEGORIES.find((x) => x.id === c)?.hinglish ?? c}</Badge>
        ))}
      </div>
      <h1 className="mt-2 text-2xl font-bold">{o.title}</h1>
      <p className="mt-1 text-muted">{o.summary}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <LinkButton href={`/app/briefs/new?opportunity=${o.id}`}>Generate brief</LinkButton>
        <LinkButton href={`/app/caption-studio?opportunity=${o.id}`} variant="secondary">
          Open in Caption Studio
        </LinkButton>
        <form action={save}>
          <Button type="submit" variant="secondary" aria-pressed={d.saved}>
            {d.saved ? "★ Saved" : "☆ Save"}
          </Button>
        </form>
      </div>

      {o.sensitivityNote && (
        <Notice tone="warn" title="Before you post" className="mt-4">
          {o.sensitivityNote}
        </Notice>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card className="p-4 md:col-span-2">
          <h2 className="font-semibold">Why it may fit you</h2>
          <p className="mt-1 text-sm">{o.fitReason}</p>
          <h2 className="mt-5 font-semibold">Original angles</h2>
          <ul className="mt-2 space-y-3">
            {o.angles.map((a, i) => (
              <li key={a.title} className="rounded-lg border border-line p-3">
                <p className="text-sm font-semibold">{a.title}</p>
                <p className="text-sm text-muted">{a.description}</p>
                <div className="mt-2 flex gap-2">
                  <Link href={`/app/briefs/new?opportunity=${o.id}&angle=${i}`} className="text-xs font-semibold text-brand underline">
                    Brief with this angle
                  </Link>
                  <Link href={`/app/caption-studio?opportunity=${o.id}&angle=${i}`} className="text-xs font-semibold text-brand underline">
                    Caption for this angle
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          {o.suggestedHashtags.length > 0 && (
            <>
              <h2 className="mt-5 font-semibold">Hashtag suggestions</h2>
              <p className="text-xs text-muted">Relevant hashtag suggestions. Current trend status not verified.</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {o.suggestedHashtags.map((h) => (
                  <Badge key={h}>{h}</Badge>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="p-4 text-sm">
          <h2 className="font-semibold">At a glance</h2>
          <dl className="mt-2 space-y-2">
            <div>
              <dt className="text-xs text-muted">Production effort (estimate)</dt>
              <dd>{o.effort}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Languages</dt>
              <dd>{o.languages.map((l) => labelFor(LANGUAGES, l)).join(", ") || "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Regions</dt>
              <dd>{o.regions.map((r) => labelFor(REGIONS, r)).join(", ") || "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Suits</dt>
              <dd>{o.platforms.map((p) => getPlatform(p).label).join(", ")}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Evidence confidence</dt>
              <dd>{CONFIDENCE_COPY[d.confidence]}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Freshness</dt>
              <dd>
                <FreshnessLabel item={d} />
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="mt-4 p-4">
        <h2 className="font-semibold">Evidence</h2>
        {d.evidence.length === 0 ? (
          <p className="mt-1 text-sm text-muted">
            No source observation backs this item. It is an editorial idea — useful, but not evidence of a trend.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {d.evidence.map((e) => {
              const src = SOURCES.find((s) => s.key === e.sourceKey);
              return (
                <li key={e.id} className="rounded-lg border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{e.title}</span>
                    {e.isDemo && <Badge tone="accent">Demo sample</Badge>}
                  </div>
                  <dl className="mt-1 grid gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-2">
                    <div>Source: {SOURCE_NAMES[e.sourceKey] ?? e.sourceKey}</div>
                    <div>Platform: {e.platform}</div>
                    <div>Observed: {formatDateTime(e.observedAt)}</div>
                    <div>Retrieved: {formatDateTime(e.retrievedAt)}</div>
                    <div>Geography: {e.geo}{e.language ? ` · language ${e.language}` : ""}</div>
                    <div>
                      {e.rank != null ? `Position in source list: #${e.rank}` : "Position: unknown"}
                      {e.metricName && e.metricValue != null && e.metricName !== "demo_rank" && e.metricName !== "chart_position"
                        ? ` · ${e.metricName}: ${e.metricValue.toLocaleString("en-IN")}`
                        : ""}
                    </div>
                  </dl>
                  <p className="mt-1 text-xs">Coverage: {e.coverageNote}</p>
                  {src && src.kind === "trend_topics" && <p className="mt-1 text-xs text-warn">Reading interest is not social-media popularity.</p>}
                  {e.url && (
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-semibold text-brand underline">
                      Open source ↗
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <h3 className="mt-5 text-sm font-semibold">Momentum</h3>
        {d.momentum ? (
          <div className="mt-1 text-sm">
            <p className="text-xs text-muted">
              Comparable observations only: same source ({SOURCE_NAMES[d.momentum.sourceKey] ?? d.momentum.sourceKey}), same item, geography {d.momentum.geo}. Lower position number = higher in that list.
            </p>
            <ol className="mt-2 flex flex-wrap gap-2">
              {d.momentum.points.map((p) => (
                <li key={p.date} className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs">
                  {formatDate(p.date)}: <span className="font-semibold">#{p.rank}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted">Not shown — fewer than two comparable observations exist.</p>
        )}
      </Card>

      <Card className="mt-4 p-4">
        <h2 className="font-semibold">Not for you?</h2>
        <form action={reject} className="mt-2 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="reason" className="sr-only">
            Reason (optional)
          </label>
          <Input id="reason" name="reason" maxLength={200} placeholder="Optional reason, e.g. “not my niche”" />
          <button type="submit" className={buttonClass("secondary")}>
            Hide this idea
          </button>
        </form>
        <p className="mt-1 text-xs text-muted">Only used to personalise your own feed. You can undo it from the feed.</p>
      </Card>
    </div>
  );
}
