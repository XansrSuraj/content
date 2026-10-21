import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { LANGUAGES, REGIONS } from "@/lib/domain/options";
import { PLATFORMS } from "@/lib/domain/platforms";
import { getFeed, type FeedItem } from "@/lib/services/discovery";
import { providerStatus } from "@/lib/services/status";
import { getServerDict } from "@/lib/i18n/server";
import { clearRejections } from "@/app/actions/work";
import { Button, EmptyState, Input, LinkButton, Notice, PageHeader, Select } from "@/components/ui";
import { OpportunityCard } from "@/components/opportunity-card";

export async function generateMetadata() {
  const { d } = await getServerDict();
  return { title: d.opps.title };
}

const GROUP_ORDER: FeedItem["opportunity"]["group"][] = ["timely", "plan", "evergreen"];
const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function OpportunitiesPage(props: PageProps<"/app/opportunities">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const db = await getDb();
  const filters = {
    q: str(sp.q)?.slice(0, 100),
    language: str(sp.language),
    region: str(sp.region),
    platform: str(sp.platform),
    fresh: str(sp.fresh),
    dataset: str(sp.dataset),
  };
  const [result, status, { lang, d }] = await Promise.all([getFeed(db, user, filters), providerStatus(db), getServerDict()]);
  const t = d.opps;

  return (
    <div>
      <PageHeader title={t.title} subtitle={t.lead} />

      {result.dataset === "demo" ? (
        <Notice tone="demo" title={t.demoTitle} className="mb-4">
          {t.demoText}
        </Notice>
      ) : status.enabledRealSources === 0 ? (
        <Notice tone="info" title={t.noSourceTitle} className="mb-4">
          {t.noSourceText}
        </Notice>
      ) : status.anyStale ? (
        <Notice tone="warn" title={t.staleTitle} className="mb-4">
          {t.staleText}
        </Notice>
      ) : null}

      <form className="mb-6 grid gap-2 rounded-xl border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-6" role="search">
        <label className="sr-only" htmlFor="f-q">
          {t.search}
        </label>
        <Input id="f-q" name="q" placeholder={t.search} defaultValue={filters.q} className="lg:col-span-2" />
        <label className="sr-only" htmlFor="f-lang">
          {t.anyLanguage}
        </label>
        <Select id="f-lang" name="language" defaultValue={filters.language ?? ""}>
          <option value="">{t.anyLanguage}</option>
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {d.options.contentLanguages[l.id] ?? l.label}
            </option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="f-region">
          {t.anyRegion}
        </label>
        <Select id="f-region" name="region" defaultValue={filters.region ?? ""}>
          <option value="">{t.anyRegion}</option>
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {d.options.regions[r.id] ?? r.label}
            </option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="f-platform">
          {t.anyPlatform}
        </label>
        <Select id="f-platform" name="platform" defaultValue={filters.platform ?? ""}>
          <option value="">{t.anyPlatform}</option>
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="f-fresh">
          {t.anyFreshness}
        </label>
        <Select id="f-fresh" name="fresh" defaultValue={filters.fresh ?? ""}>
          <option value="">{t.anyFreshness}</option>
          <option value="24h">{t.fresh24}</option>
          <option value="72h">{t.fresh72}</option>
        </Select>
        {config().demoEnabled && (
          <>
            <label className="sr-only" htmlFor="f-dataset">
              {t.datasetDemo}
            </label>
            <Select id="f-dataset" name="dataset" defaultValue={result.dataset}>
              <option value="demo">{t.datasetDemo}</option>
              <option value="observed">{t.datasetObserved}</option>
            </Select>
          </>
        )}
        <div className="flex gap-2 sm:col-span-2 lg:col-span-7">
          <Button type="submit" size="sm">
            {t.apply}
          </Button>
          <LinkButton href="/app/opportunities" size="sm" variant="ghost">
            {t.reset}
          </LinkButton>
        </div>
      </form>

      {filters.fresh && <p className="mb-4 text-xs text-muted">{t.freshNote}</p>}
      {result.hiddenByFeedback > 0 && (
        <form action={clearRejections} className="mb-4 flex items-center gap-2 text-xs text-muted">
          {t.hiddenByFeedback(result.hiddenByFeedback)}
          <button type="submit" className="font-semibold text-brand underline">
            {t.showAgain}
          </button>
        </form>
      )}

      {result.feed.length === 0 ? (
        <EmptyState
          title={t.emptyTitle}
          action={
            <LinkButton href="/app/briefs/new" variant="secondary">
              {t.emptyAction}
            </LinkButton>
          }
        >
          {result.dataset === "observed" ? t.emptyObserved : t.emptyDemo}
        </EmptyState>
      ) : (
        <div className="space-y-10">
          {GROUP_ORDER.map((g) => {
            const items = result.feed.filter((f) => f.opportunity.group === g);
            if (!items.length) return null;
            const [title, hint] = t.groups[g];
            return (
              <section key={g} aria-labelledby={`g-${g}`}>
                <h2 id={`g-${g}`} className="text-lg font-semibold">
                  {title}
                </h2>
                <p className="mb-3 text-xs text-muted">{hint}</p>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) => (
                    <OpportunityCard key={item.opportunity.id} item={item} d={d} lang={lang} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <section className="mt-10 rounded-xl border border-dashed border-line p-4 text-sm">
        <h2 className="font-semibold">{t.audioTitle}</h2>
        <p className="mt-1 text-muted">
          {t.audioText}{" "}
          <Link href="/app/published" className="font-semibold text-brand underline">
            {d.nav.published}
          </Link>
        </p>
      </section>
    </div>
  );
}
