import { ExternalLink, FileText, PenLine, Search, BookOpen } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { sourceStatus } from "@/lib/providers/trends/catalog";
import { trendingNow } from "@/lib/services/trend-context";
import { getServerDict } from "@/lib/i18n/server";
import { Badge, Card, EmptyState, LinkButton, Notice, PageHeader, formatDateTime } from "@/components/ui";

export async function generateMetadata() {
  const { d } = await getServerDict();
  return { title: d.trending.title };
}

export default async function TrendingNowPage() {
  await requireUser();
  const db = await getDb();
  const cfg = config();
  const google = sourceStatus("google_trends_rss_in", cfg).status === "enabled";
  const wiki = sourceStatus("wikimedia_top_in", cfg).status === "enabled";
  const [{ items, hidden }, { lang, d }] = await Promise.all([trendingNow(db), getServerDict()]);
  const t = d.trending;
  const latest = items.reduce<Date | null>((acc, i) => (!acc || i.retrievedAt > acc ? i.retrievedAt : acc), null);

  return (
    <div>
      <PageHeader title={t.title} subtitle={t.lead} />

      <Notice tone="info" className="mb-5" title={t.whatTitle}>
        {t.what(wiki)}
        {latest ? t.refreshed(formatDateTime(latest, lang)) : ""}
      </Notice>

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
                    <a href={i.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
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

      {hidden > 0 && <p className="mt-5 text-xs text-muted">{t.hidden(hidden)}</p>}
    </div>
  );
}
