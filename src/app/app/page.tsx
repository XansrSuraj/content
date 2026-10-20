import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/repo/creator";
import { listConversations } from "@/lib/repo/studio";
import { listBriefs } from "@/lib/repo/work";
import { getFeed } from "@/lib/services/discovery";
import { t } from "@/lib/i18n";
import { Card, EmptyState, LinkButton, formatDate } from "@/components/ui";
import { OpportunityCard } from "@/components/opportunity-card";

export const metadata = { title: "Home" };

export default async function AppHome() {
  const user = await requireUser();
  const db = await getDb();
  const [profile, convs, briefs, feed] = await Promise.all([
    getProfile(db, user.id),
    listConversations(db, user.id),
    listBriefs(db, user.id),
    getFeed(db, user, {}),
  ]);
  const lang = profile?.uiLanguage ?? "hinglish";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">
          {t(lang, "welcome")}
          {profile?.displayName ? `, ${profile.displayName}` : ""} 👋
        </h1>
        <p className="mt-1 text-sm text-muted">{t(lang, "homeLead")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/app/caption-studio" className="rounded-xl border border-brand bg-brand p-4 text-brand-fg hover:opacity-95">
          <p className="font-semibold">✎ Caption sudharo</p>
          <p className="mt-1 text-sm opacity-90">Paste a caption or describe your video.</p>
        </Link>
        <Link href="/app/opportunities" className="rounded-xl border border-line bg-surface p-4 hover:border-brand">
          <p className="font-semibold">◎ Naya idea dhoondo</p>
          <p className="mt-1 text-sm text-muted">Ideas for your niche, with evidence.</p>
        </Link>
        <Link href="/app/briefs/new" className="rounded-xl border border-line bg-surface p-4 hover:border-brand">
          <p className="font-semibold">▤ Brief banao</p>
          <p className="mt-1 text-sm text-muted">Turn any topic into a shootable plan.</p>
        </Link>
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-semibold">Ideas for you</h2>
          <Link href="/app/opportunities" className="text-sm font-semibold text-brand">
            See all →
          </Link>
        </div>
        {feed.feed.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {feed.feed.slice(0, 3).map((item) => (
              <OpportunityCard key={item.opportunity.id} item={item} />
            ))}
          </div>
        ) : (
          <EmptyState title="No observed opportunities yet">
            No real trend source has produced curated opportunities on this server yet. You can still use Caption Studio
            and create briefs from your own topics.
          </EmptyState>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h2 className="font-semibold">Recent captions</h2>
          {convs.length ? (
            <ul className="mt-2 divide-y divide-line">
              {convs.slice(0, 4).map((c) => (
                <li key={c.id} className="py-2">
                  <Link href={`/app/caption-studio?c=${c.id}`} className="text-sm hover:underline">
                    {c.title}
                  </Link>
                  <span className="ml-2 text-xs text-muted">{formatDate(c.updatedAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Nothing yet.</p>
          )}
        </Card>
        <Card className="p-4">
          <h2 className="font-semibold">Recent briefs</h2>
          {briefs.length ? (
            <ul className="mt-2 divide-y divide-line">
              {briefs.slice(0, 4).map((b) => (
                <li key={b.id} className="py-2">
                  <Link href={`/app/briefs/${b.id}`} className="text-sm hover:underline">
                    {b.topic}
                  </Link>
                  <span className="ml-2 text-xs text-muted">{formatDate(b.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2">
              <LinkButton href="/app/briefs/new" size="sm" variant="secondary">
                Create a brief
              </LinkButton>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
