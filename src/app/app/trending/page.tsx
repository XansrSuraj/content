import type { ReactNode } from "react";
import { BookOpen, CalendarClock, ExternalLink, FileText, Globe, Mic, PenLine, Search, SquarePlay } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { upcomingMatches } from "@/lib/services/sports-context";
import { MatchCards } from "@/components/match-cards";
import { config } from "@/lib/config";
import { sourceStatus } from "@/lib/providers/trends/catalog";
import { latestBatch, trendingNow, type BatchItem } from "@/lib/services/trend-context";
import { getServerDict } from "@/lib/i18n/server";
import { Badge, Card, EmptyState, LinkButton, Notice, PageHeader, formatDateTime } from "@/components/ui";

export async function generateMetadata() {
  const { d } = await getServerDict();
  return { title: d.trending.title };
}

export default async function TrendingNowPage() {
  const user = await requireUser();
  const db = await getDb();
  const cfg = config();
  const google = sourceStatus("google_trends_rss_in", cfg).status === "enabled";
  const wiki = sourceStatus("wikimedia_top_in", cfg).status === "enabled";
  const [{ items, hidden, otherTopics }, matches, { lang, d }] = await Promise.all([trendingNow(db), upcomingMatches(db, user.id), getServerDict()]);
  const podcastsOn = sourceStatus("apple_podcasts_top_in", cfg).status === "enabled";
  const youtubeOn = sourceStatus("youtube_most_popular_in", cfg).status === "enabled";
  const blueskyOn = sourceStatus("bluesky_trends", cfg).status === "enabled";
  const mastodonOn = sourceStatus("mastodon_trending_tags", cfg).status === "enabled";
  // trendingNow refreshed every stale source, so the charts read here are current.
  const [youtube, podcasts, bluesky, mastodon] = await Promise.all([
    // Already the Sports-category chart (filtered at ingest), so no title filter here.
    youtubeOn ? latestBatch(db, "youtube_most_popular_in", 10) : [],
    podcastsOn ? latestBatch(db, "apple_podcasts_top_in", 10, { sportsOnly: true }) : [],
    blueskyOn ? latestBatch(db, "bluesky_trends", 12, { sportsOnly: true }) : [],
    mastodonOn ? latestBatch(db, "mastodon_trending_tags", 12, { sportsOnly: true }) : [],
  ]);
  const t = d.trending;
  const latest = items.reduce<Date | null>((acc, i) => (!acc || i.retrievedAt > acc ? i.retrievedAt : acc), null);

  return (
    <div>
      <PageHeader title={t.title} subtitle={t.lead} />

      <Notice tone="info" className="mb-5" title={t.whatTitle}>
        {t.what(wiki)}
        {latest ? t.refreshed(formatDateTime(latest, lang)) : ""}
      </Notice>

      <section className="mb-10" aria-labelledby="matches-title">
        <h2 id="matches-title" className="flex items-center gap-2 text-lg font-semibold">
          <CalendarClock aria-hidden className="h-5 w-5 text-brand" />
          {t.matchesTitle}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">{t.matchesLead}</p>
        <div className="mt-4">
          {matches.length ? <MatchCards matches={matches} captionLabel={t.matchCaption} /> : <p className="text-sm text-muted">{t.matchesEmpty}</p>}
        </div>
      </section>

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-6">
        <div className="min-w-0">
          {!google && !wiki ? (
            <EmptyState title={t.offTitle}>{t.offText}</EmptyState>
          ) : items.length === 0 ? (
            <EmptyState title={t.emptyTitle}>{t.emptyText}</EmptyState>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((i) => {
                const topic = encodeURIComponent(i.title);
                const isGoogle = i.sourceKey === "google_trends_rss_in";
                const SourceIcon = isGoogle ? Search : BookOpen;
                return (
                  <Card key={i.id} className="flex flex-col p-5 transition-shadow hover:shadow-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="brand">
                        <SourceIcon aria-hidden className="h-3 w-3" />
                        {isGoogle ? t.google : t.wikipedia}
                      </Badge>
                      {i.metric && <Badge>{i.metric}</Badge>}
                      <span className="text-xs text-muted">{formatDateTime(i.observedAt, lang)}</span>
                    </div>
                    <h2 className="mt-3 text-lg font-semibold leading-snug">{i.title}</h2>
                    <p className="mt-1 text-xs text-muted">{t.checkFacts}</p>
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                      <LinkButton href={`/app/caption-studio?topic=${topic}`} size="sm">
                        <PenLine aria-hidden className="h-3.5 w-3.5" />
                        {t.makeCaption}
                      </LinkButton>
                      <LinkButton href={`/app/briefs/new?topic=${topic}`} size="sm" variant="secondary">
                        <FileText aria-hidden className="h-3.5 w-3.5" />
                        {t.makeBrief}
                      </LinkButton>
                      {i.url && (
                        <a
                          href={i.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                        >
                          {d.common.source}
                          <ExternalLink aria-hidden className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {otherTopics > 0 && <p className="mt-5 text-xs text-muted">{t.sportsOnly(otherTopics)}</p>}
          {hidden > 0 && <p className="mt-2 text-xs text-muted">{t.hidden(hidden)}</p>}
        </div>

        <aside className="mt-10 space-y-8 xl:mt-0">
          {youtubeOn && (
            <ChartList
              id="youtube"
              icon={<SquarePlay aria-hidden className="h-5 w-5 text-brand" />}
              title={t.youtubeTitle}
              lead={t.youtubeLead}
              items={youtube}
              empty={t.chartEmpty}
              openLabel={d.common.open}
              footer={youtube[0] ? `${t.youtubeSource} · ${formatDateTime(youtube[0].observedAt, lang)}` : null}
            />
          )}
          {podcastsOn && (
            <ChartList
              id="podcasts"
              icon={<Mic aria-hidden className="h-5 w-5 text-brand" />}
              title={t.podcastsTitle}
              lead={t.podcastsLead}
              items={podcasts}
              empty={t.chartEmpty}
              openLabel={d.common.open}
              footer={podcasts[0] ? `${t.podcastsSource} · ${formatDateTime(podcasts[0].observedAt, lang)}` : null}
            />
          )}
        </aside>
      </div>

      {(blueskyOn || mastodonOn) && (
        <section className="mt-12" aria-labelledby="world-title">
          <h2 id="world-title" className="flex items-center gap-2 text-lg font-semibold">
            <Globe aria-hidden className="h-5 w-5 text-brand" />
            {t.worldTitle}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">{t.worldLead}</p>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            {blueskyOn && (
              <ChartList id="bluesky" title={t.blueskyTitle} items={bluesky} empty={t.worldEmpty} openLabel={d.common.open} compactTitle />
            )}
            {mastodonOn && (
              <ChartList id="mastodon" title={t.mastodonTitle} items={mastodon} empty={t.worldEmpty} openLabel={d.common.open} compactTitle />
            )}
          </div>
          <p className="mt-2 text-xs text-muted">{t.worldSource}</p>
        </section>
      )}
    </div>
  );
}

function ChartList({
  id,
  icon,
  title,
  lead,
  items,
  empty,
  openLabel,
  footer,
  compactTitle = false,
}: {
  id: string;
  icon?: ReactNode;
  title: string;
  lead?: string;
  items: BatchItem[];
  empty: string;
  openLabel: string;
  footer?: string | null;
  compactTitle?: boolean;
}) {
  return (
    <section aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className={compactTitle ? "text-sm font-semibold" : "flex items-center gap-2 text-lg font-semibold"}>
        {icon}
        {title}
      </h3>
      {lead && <p className="mt-1 text-sm text-muted">{lead}</p>}
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <Card className="mt-3 divide-y divide-line">
          {items.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-6 shrink-0 text-right font-semibold tabular-nums text-muted">{s.rank}</span>
              <span className="min-w-0 flex-1 truncate" title={s.title}>
                {s.title}
              </span>
              {s.metric && <span className="hidden shrink-0 text-xs text-muted sm:inline">{s.metric}</span>}
              {s.url && (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${openLabel}: ${s.title}`}
                  className="inline-flex shrink-0 items-center text-brand hover:opacity-80"
                >
                  <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          ))}
        </Card>
      )}
      {footer && <p className="mt-2 text-xs text-muted">{footer}</p>}
    </section>
  );
}
