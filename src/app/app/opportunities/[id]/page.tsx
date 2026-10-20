import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bookmark, BookmarkCheck, ExternalLink, FileText, PenLine } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { getPlatform } from "@/lib/domain/platforms";
import { SOURCES, SOURCE_NAMES } from "@/lib/providers/trends/catalog";
import { getOpportunityDetail } from "@/lib/services/discovery";
import { getServerDict } from "@/lib/i18n/server";
import type { Dict } from "@/lib/i18n";
import { rejectOpportunity, toggleSaveOpportunity } from "@/app/actions/work";
import { Badge, Button, Card, Input, LinkButton, Notice, buttonClass, formatDate, formatDateTime } from "@/components/ui";
import { FreshnessLabel } from "@/components/opportunity-card";

export async function generateMetadata() {
  const { d } = await getServerDict();
  return { title: d.opps.title };
}

/** Source-provided metrics only, described the way the source defines them. */
function metricLabel(name: string | null, value: number | null, d: Dict): string {
  if (!name || value == null) return "";
  if (name === "views_ceil") return d.oppDetail.metricViews(value.toLocaleString("en-IN"));
  if (name === "approx_traffic") return d.oppDetail.metricSearches(value.toLocaleString("en-IN"));
  return "";
}

export default async function OpportunityDetail(props: PageProps<"/app/opportunities/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const db = await getDb();
  const [detail, { lang, d }] = await Promise.all([getOpportunityDetail(db, user, id), getServerDict()]);
  if (!detail) notFound();
  const t = d.oppDetail;
  const o = detail.opportunity;
  const save = toggleSaveOpportunity.bind(null, o.id, detail.saved);
  const reject = rejectOpportunity.bind(null, o.id);
  const SaveIcon = detail.saved ? BookmarkCheck : Bookmark;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/app/opportunities" className="inline-flex items-center gap-1 text-sm font-medium text-brand">
        <ArrowLeft aria-hidden className="h-4 w-4" />
        {t.all}
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {o.isDemo && <Badge tone="accent">{t.demoSample}</Badge>}
        <Badge tone="brand">{d.opps.groups[o.group]?.[0] ?? o.group}</Badge>
        {o.categories.map((c) => (
          <Badge key={c}>{d.options.categories[c] ?? c}</Badge>
        ))}
      </div>
      <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{o.title}</h1>
      <p className="mt-1 text-muted">{o.summary}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        <LinkButton href={`/app/briefs/new?opportunity=${o.id}`}>
          <FileText aria-hidden className="h-4 w-4" />
          {d.opps.generateBrief}
        </LinkButton>
        <LinkButton href={`/app/caption-studio?opportunity=${o.id}`} variant="secondary">
          <PenLine aria-hidden className="h-4 w-4" />
          {t.openStudio}
        </LinkButton>
        <form action={save}>
          <Button type="submit" variant="secondary" aria-pressed={detail.saved}>
            <SaveIcon aria-hidden className="h-4 w-4" />
            {detail.saved ? d.opps.savedLabel : d.opps.save}
          </Button>
        </form>
      </div>

      {o.sensitivityNote && (
        <Notice tone="warn" title={t.beforePost} className="mt-5">
          {o.sensitivityNote}
        </Notice>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card className="p-5 md:col-span-2">
          <h2 className="font-semibold">{t.whyFit}</h2>
          <p className="mt-1 text-sm">{o.fitReason}</p>
          <h2 className="mt-6 font-semibold">{t.angles}</h2>
          <ul className="mt-2 space-y-3">
            {o.angles.map((a, i) => (
              <li key={a.title} className="rounded-lg border border-line p-3">
                <p className="text-sm font-semibold">{a.title}</p>
                <p className="text-sm text-muted">{a.description}</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <Link href={`/app/briefs/new?opportunity=${o.id}&angle=${i}`} className="text-xs font-semibold text-brand hover:underline">
                    {t.briefAngle}
                  </Link>
                  <Link href={`/app/caption-studio?opportunity=${o.id}&angle=${i}`} className="text-xs font-semibold text-brand hover:underline">
                    {t.captionAngle}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          {o.suggestedHashtags.length > 0 && (
            <>
              <h2 className="mt-6 font-semibold">{t.hashtagSuggestions}</h2>
              <p className="text-xs text-muted">{d.result.notVerified}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {o.suggestedHashtags.map((h) => (
                  <Badge key={h}>{h}</Badge>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="p-5 text-sm">
          <h2 className="font-semibold">{t.glance}</h2>
          <dl className="mt-3 space-y-3">
            <div>
              <dt className="text-xs text-muted">{t.effort}</dt>
              <dd>{d.opps.effort[o.effort] ?? o.effort}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t.languages}</dt>
              <dd>{o.languages.map((l) => d.options.contentLanguages[l] ?? l).join(", ") || d.common.unknown}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t.regions}</dt>
              <dd>{o.regions.map((r) => d.options.regions[r] ?? r).join(", ") || d.common.unknown}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t.suits}</dt>
              <dd>{o.platforms.map((p) => getPlatform(p).label).join(", ")}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t.confidence}</dt>
              <dd>{d.opps.confidence[detail.confidence]}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t.freshness}</dt>
              <dd>
                <FreshnessLabel item={detail} d={d} lang={lang} />
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <h2 className="font-semibold">{t.evidence}</h2>
        {detail.evidence.length === 0 ? (
          <p className="mt-1 text-sm text-muted">{t.noEvidence}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {detail.evidence.map((e) => {
              const src = SOURCES.find((s) => s.key === e.sourceKey);
              return (
                <li key={e.id} className="rounded-lg border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{e.title}</span>
                    {e.isDemo && <Badge tone="accent">{d.common.demo}</Badge>}
                  </div>
                  <dl className="mt-1.5 grid gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-2">
                    <div>
                      {t.sourceL}: {SOURCE_NAMES[e.sourceKey] ?? e.sourceKey}
                    </div>
                    <div>
                      {t.platformL}: {e.platform}
                    </div>
                    <div>
                      {t.observedL}: {formatDateTime(e.observedAt, lang)}
                    </div>
                    <div>
                      {t.retrievedL}: {formatDateTime(e.retrievedAt, lang)}
                    </div>
                    <div>
                      {t.geoL}: {e.geo}
                      {e.language ? ` · ${t.languageL} ${e.language}` : ""}
                    </div>
                    <div>
                      {e.rank != null ? t.position(e.rank) : t.positionUnknown}
                      {metricLabel(e.metricName, e.metricValue, d)}
                    </div>
                  </dl>
                  <p className="mt-1.5 text-xs">
                    {d.result.coverage} {e.coverageNote}
                  </p>
                  {src?.kind === "trend_topics" && <p className="mt-1 text-xs text-warn">{t.readingNote}</p>}
                  {src?.kind === "search_interest" && <p className="mt-1 text-xs text-warn">{t.searchNote}</p>}
                  {e.url && (
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                      {t.openSource}
                      <ExternalLink aria-hidden className="h-3 w-3" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <h3 className="mt-6 text-sm font-semibold">{t.momentum}</h3>
        {detail.momentum ? (
          <div className="mt-1 text-sm">
            <p className="text-xs text-muted">{t.momentumNote(SOURCE_NAMES[detail.momentum.sourceKey] ?? detail.momentum.sourceKey, detail.momentum.geo)}</p>
            <ol className="mt-2 flex flex-wrap gap-2">
              {detail.momentum.points.map((p) => (
                <li key={p.date} className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs">
                  {formatDate(p.date, lang)}: <span className="font-semibold">#{p.rank}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted">{t.momentumNone}</p>
        )}
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="font-semibold">{t.notForYou}</h2>
        <form action={reject} className="mt-2 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="reason" className="sr-only">
            {t.reasonLabel}
          </label>
          <Input id="reason" name="reason" maxLength={200} placeholder={t.reasonPlaceholder} />
          <button type="submit" className={buttonClass("secondary")}>
            {t.hide}
          </button>
        </form>
        <p className="mt-1 text-xs text-muted">{t.hideNote}</p>
      </Card>
    </div>
  );
}
