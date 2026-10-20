import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { CATEGORIES, LANGUAGES, REGIONS } from "@/lib/domain/options";
import { PLATFORMS } from "@/lib/domain/platforms";
import { getProfile } from "@/lib/repo/creator";
import { getFeed, type FeedItem } from "@/lib/services/discovery";
import { providerStatus } from "@/lib/services/status";
import { t } from "@/lib/i18n";
import { clearRejections } from "@/app/actions/work";
import { Button, EmptyState, Input, LinkButton, Notice, PageHeader, Select } from "@/components/ui";
import { OpportunityCard } from "@/components/opportunity-card";

export const metadata = { title: "Opportunities" };

const GROUPS: { id: FeedItem["opportunity"]["group"]; title: string; hint: string }[] = [
  { id: "timely", title: "Timely opportunities", hint: "Backed by recent observations, where available." },
  { id: "plan", title: "Worth planning", hint: "Seasonal or upcoming — prepare ahead." },
  { id: "evergreen", title: "Evergreen ideas", hint: "Work any week. Usually no trend evidence, and labeled so." },
];

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function OpportunitiesPage(props: PageProps<"/app/opportunities">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const db = await getDb();
  const filters = {
    q: str(sp.q)?.slice(0, 100),
    category: str(sp.category),
    language: str(sp.language),
    region: str(sp.region),
    platform: str(sp.platform),
    fresh: str(sp.fresh),
    dataset: str(sp.dataset),
  };
  const [profile, result, status] = await Promise.all([getProfile(db, user.id), getFeed(db, user, filters), providerStatus(db)]);
  const lang = profile?.uiLanguage ?? "hinglish";
  const audio = status.sources.find((s) => s.key === "trending_audio");

  return (
    <div>
      <PageHeader title={t(lang, "opportunities")} subtitle={t(lang, "oppsLead")} />

      {result.dataset === "demo" ? (
        <Notice tone="demo" title="Demo sample data" className="mb-4">
          These opportunities and their “observations” were written for the demo. They are not real trend data.
        </Notice>
      ) : status.enabledRealSources === 0 ? (
        <Notice tone="info" title="Trend provider unavailable" className="mb-4">
          No real trend source is configured on this server, so only curated ideas (if any) appear. See Settings → Data
          sources for what each source needs.
        </Notice>
      ) : status.anyStale ? (
        <Notice tone="warn" title="Source data stale" className="mb-4">
          At least one enabled source hasn&apos;t refreshed recently. Freshness labels on each card show the real observation time.
        </Notice>
      ) : null}

      <form className="mb-6 grid gap-2 rounded-xl border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-7" role="search">
        <label className="sr-only" htmlFor="f-q">Search topics</label>
        <Input id="f-q" name="q" placeholder="Search topics…" defaultValue={filters.q} className="lg:col-span-2" />
        <label className="sr-only" htmlFor="f-cat">Category</label>
        <Select id="f-cat" name="category" defaultValue={filters.category ?? ""}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.hinglish}</option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="f-lang">Language</label>
        <Select id="f-lang" name="language" defaultValue={filters.language ?? ""}>
          <option value="">Any language</option>
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="f-region">Region</label>
        <Select id="f-region" name="region" defaultValue={filters.region ?? ""}>
          <option value="">Any region</option>
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="f-platform">Publishing destination</label>
        <Select id="f-platform" name="platform" defaultValue={filters.platform ?? ""}>
          <option value="">Any destination</option>
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="f-fresh">Freshness</label>
        <Select id="f-fresh" name="fresh" defaultValue={filters.fresh ?? ""}>
          <option value="">Any freshness</option>
          <option value="24h">Observed in last 24h</option>
          <option value="72h">Observed in last 72h</option>
        </Select>
        {config().demoEnabled && (
          <>
            <label className="sr-only" htmlFor="f-dataset">Dataset</label>
            <Select id="f-dataset" name="dataset" defaultValue={result.dataset}>
              <option value="demo">Demo sample data</option>
              <option value="observed">Observed sources</option>
            </Select>
          </>
        )}
        <div className="flex gap-2 sm:col-span-2 lg:col-span-7">
          <Button type="submit" size="sm">Apply filters</Button>
          <LinkButton href="/app/opportunities" size="sm" variant="ghost">Reset</LinkButton>
        </div>
      </form>

      {filters.fresh && (
        <p className="mb-4 text-xs text-muted">Freshness filter only keeps items with a source observation; ideas without evidence are hidden.</p>
      )}
      {result.hiddenByFeedback > 0 && (
        <form action={clearRejections} className="mb-4 flex items-center gap-2 text-xs text-muted">
          {result.hiddenByFeedback} idea{result.hiddenByFeedback > 1 ? "s" : ""} hidden because you marked them “not for me”.
          <button type="submit" className="font-semibold text-brand underline">Show again</button>
        </form>
      )}

      {result.feed.length === 0 ? (
        <EmptyState title="Koi opportunity nahi mili" action={<LinkButton href="/app/briefs/new" variant="secondary">Create a brief from your own topic</LinkButton>}>
          {result.dataset === "observed"
            ? "No curated opportunities from observed sources match these filters. Unknown values are left empty rather than guessed."
            : "Try removing a filter."}
        </EmptyState>
      ) : (
        <div className="space-y-10">
          {GROUPS.map((g) => {
            const items = result.feed.filter((f) => f.opportunity.group === g.id);
            if (!items.length) return null;
            return (
              <section key={g.id} aria-labelledby={`g-${g.id}`}>
                <h2 id={`g-${g.id}`} className="text-lg font-semibold">{g.title}</h2>
                <p className="mb-3 text-xs text-muted">{g.hint}</p>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) => (
                    <OpportunityCard key={item.opportunity.id} item={item} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <section className="mt-10 rounded-xl border border-dashed border-line p-4 text-sm">
        <h2 className="font-semibold">Trending audio & posting times</h2>
        <p className="mt-1 text-muted">
          {audio?.name}: not connected — no licensed audio-trend source is configured, so no audio list is shown.
          Best posting time is not a universal number; your own posting log on the{" "}
          <a href="/app/published" className="font-semibold text-brand underline">Published</a> page shows patterns from your own entries.
        </p>
      </section>
    </div>
  );
}
