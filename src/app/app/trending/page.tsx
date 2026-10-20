import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { sourceStatus } from "@/lib/providers/trends/catalog";
import { trendingNow } from "@/lib/services/trend-context";
import { Badge, Card, EmptyState, LinkButton, Notice, PageHeader, formatDateTime } from "@/components/ui";

export const metadata = { title: "Trending now" };

export default async function TrendingNowPage() {
  await requireUser();
  const db = await getDb();
  const cfg = config();
  const google = sourceStatus("google_trends_rss_in", cfg).status === "enabled";
  const wiki = sourceStatus("wikimedia_top_in", cfg).status === "enabled";
  const { items, hidden } = await trendingNow(db);
  const latest = items.reduce<Date | null>((d, i) => (!d || i.retrievedAt > d ? i.retrievedAt : d), null);

  return (
    <div>
      <PageHeader
        title="Trending now"
        subtitle="Real searches people in India are making right now. Pick one and turn it into your own angle — caption or brief in one click."
      />

      <Notice tone="info" className="mb-4" title="What this shows">
        Google search interest{wiki ? " and Wikipedia reading interest" : ""} in India — not Instagram, YouTube or TikTok
        popularity. Data source: Google Trends{wiki ? ", Wikimedia" : ""}.
        {latest ? ` Last refreshed ${formatDateTime(latest)}.` : ""}
      </Notice>

      {!google && !wiki ? (
        <EmptyState title="No trend source is turned on">
          Set <code>SOURCE_GOOGLE_TRENDS_RSS_ENABLED=true</code> in <code>.env.local</code> (free, no key) and restart the server.
        </EmptyState>
      ) : items.length === 0 ? (
        <EmptyState title="No fresh trends right now">
          The source returned nothing new in the last 48 hours, or the fetch failed. Check Settings → Data sources.
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((i) => {
            const topic = encodeURIComponent(i.title);
            return (
              <Card key={i.id} className="flex flex-col p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="brand">{i.sourceKey === "google_trends_rss_in" ? "Google searches" : "Wikipedia"}</Badge>
                  {i.metric && <Badge>{i.metric}</Badge>}
                  <span className="text-xs text-muted">{formatDateTime(i.observedAt)}</span>
                </div>
                <h2 className="mt-2 text-lg font-semibold">{i.title}</h2>
                <p className="mt-1 text-xs text-muted">Check facts before posting — this is a search signal, not a verified story.</p>
                <div className="mt-auto flex flex-wrap gap-2 pt-3">
                  <LinkButton href={`/app/caption-studio?topic=${topic}`} size="sm">
                    Caption banao
                  </LinkButton>
                  <LinkButton href={`/app/briefs/new?topic=${topic}`} size="sm" variant="secondary">
                    Brief banao
                  </LinkButton>
                  {i.url && (
                    <a href={i.url} target="_blank" rel="noopener noreferrer" className="self-center text-xs font-semibold text-brand underline">
                      Source ↗
                    </a>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {hidden > 0 && (
        <p className="mt-4 text-xs text-muted">
          {hidden} trend{hidden > 1 ? "s" : ""} about violence or tragedy {hidden > 1 ? "are" : "is"} hidden here. These need careful,
          human judgment before anyone makes content about them.
        </p>
      )}
    </div>
  );
}
