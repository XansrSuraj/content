import Link from "next/link";
import { ArrowRight, FileText, PenLine, TrendingUp } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/repo/creator";
import { listConversations } from "@/lib/repo/studio";
import { listBriefs } from "@/lib/repo/work";
import { getFeed } from "@/lib/services/discovery";
import { getServerDict } from "@/lib/i18n/server";
import { Card, EmptyState, LinkButton, formatDate } from "@/components/ui";
import { OpportunityCard } from "@/components/opportunity-card";

export async function generateMetadata() {
  const { d } = await getServerDict();
  return { title: d.nav.home };
}

const QUICK = [
  { href: "/app/caption-studio", Icon: PenLine, primary: true },
  { href: "/app/trending", Icon: TrendingUp, primary: false },
  { href: "/app/briefs/new", Icon: FileText, primary: false },
];

export default async function AppHome() {
  const user = await requireUser();
  const db = await getDb();
  const [profile, convs, briefs, feed, { lang, d }] = await Promise.all([
    getProfile(db, user.id),
    listConversations(db, user.id),
    listBriefs(db, user.id),
    getFeed(db, user, {}),
    getServerDict(),
  ]);
  const h = d.home;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{h.greeting(profile?.displayName ?? "")}</h1>
        <p className="mt-1 text-muted">{h.lead}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {QUICK.map(({ href, Icon, primary }, i) => (
          <Link
            key={href}
            href={href}
            className={
              primary
                ? "group rounded-xl border border-brand bg-brand p-5 text-brand-fg shadow-sm transition-opacity hover:opacity-95"
                : "group rounded-xl border border-line bg-surface p-5 transition-colors hover:border-brand"
            }
          >
            <Icon aria-hidden className="h-5 w-5" />
            <p className="mt-3 flex items-center gap-1 font-semibold">
              {h.quick[i].t}
              <ArrowRight aria-hidden className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
            </p>
            <p className={primary ? "mt-1 text-sm opacity-90" : "mt-1 text-sm text-muted"}>{h.quick[i].d}</p>
          </Link>
        ))}
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-semibold">{h.ideasForYou}</h2>
          <Link href="/app/opportunities" className="text-sm font-semibold text-brand hover:underline">
            {h.seeAll} →
          </Link>
        </div>
        {feed.feed.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {feed.feed.slice(0, 3).map((item) => (
              <OpportunityCard key={item.opportunity.id} item={item} d={d} lang={lang} />
            ))}
          </div>
        ) : (
          <EmptyState title={h.noIdeasTitle}>{h.noIdeasText}</EmptyState>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">{h.recentCaptions}</h2>
          {convs.length ? (
            <ul className="mt-2 divide-y divide-line">
              {convs.slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/app/caption-studio?c=${c.id}`} className="truncate text-sm hover:underline">
                    {c.title}
                  </Link>
                  <span className="shrink-0 text-xs text-muted">{formatDate(c.updatedAt, lang)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">{h.nothingYet}</p>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">{h.recentBriefs}</h2>
          {briefs.length ? (
            <ul className="mt-2 divide-y divide-line">
              {briefs.slice(0, 5).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/app/briefs/${b.id}`} className="truncate text-sm hover:underline">
                    {b.topic}
                  </Link>
                  <span className="shrink-0 text-xs text-muted">{formatDate(b.createdAt, lang)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3">
              <LinkButton href="/app/briefs/new" size="sm" variant="secondary">
                {h.createBrief}
              </LinkButton>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
