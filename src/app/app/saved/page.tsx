import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { listConversations, listVariants } from "@/lib/repo/studio";
import { listBriefs, listSaved } from "@/lib/repo/work";
import { getOpportunity } from "@/lib/repo/discovery";
import { getServerDict } from "@/lib/i18n/server";
import { unsaveAction } from "@/app/actions/work";
import { Card, EmptyState, LinkButton, PageHeader, buttonClass, formatDate } from "@/components/ui";
import { VariantItem } from "./variant-item";

export async function generateMetadata() {
  const { d } = await getServerDict();
  return { title: d.saved.title };
}

export default async function SavedPage() {
  const user = await requireUser();
  const db = await getDb();
  const [saved, variants, briefs, convs, { lang, d }] = await Promise.all([
    listSaved(db, user.id),
    listVariants(db, user.id),
    listBriefs(db, user.id),
    listConversations(db, user.id),
    getServerDict(),
  ]);
  const t = d.saved;
  const dataset = user.isDemo && config().demoEnabled ? "any" : "observed";
  const opps = (await Promise.all(saved.filter((s) => s.kind === "opportunity").map((s) => getOpportunity(db, s.refId, dataset)))).filter((o) => o !== null);
  const savedBriefIds = new Set(saved.filter((s) => s.kind === "brief").map((s) => s.refId));
  const savedBriefs = briefs.filter((b) => savedBriefIds.has(b.id));

  return (
    <div className="space-y-10">
      <PageHeader title={t.title} subtitle={t.lead} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t.captions(variants.length)}</h2>
        {variants.length === 0 ? (
          <EmptyState title={t.noCaptionsTitle} action={<LinkButton href="/app/caption-studio">{t.openStudio}</LinkButton>}>
            {t.noCaptionsText}
          </EmptyState>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {variants.map((v) => (
              <VariantItem
                key={v.id}
                v={{ id: v.id, label: v.label, platform: v.platform, text: v.text, hashtags: v.hashtags, edited: v.edited, conversationId: v.conversationId, date: formatDate(v.updatedAt, lang) }}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t.ideas(opps.length)}</h2>
        {opps.length === 0 ? (
          <p className="text-sm text-muted">{t.noIdeas}</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {opps.map((o) => (
              <li key={o.id}>
                <Card className="flex items-center justify-between gap-2 p-3">
                  <Link href={`/app/opportunities/${o.id}`} className="text-sm font-medium hover:underline">
                    {o.title} {o.isDemo && <span className="text-xs text-accent">({d.common.demo})</span>}
                  </Link>
                  <form action={unsaveAction.bind(null, "opportunity", o.id)}>
                    <button type="submit" className={buttonClass("ghost", "sm")}>
                      {d.common.remove}
                    </button>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t.briefs(savedBriefs.length)}</h2>
        {savedBriefs.length === 0 ? (
          <p className="text-sm text-muted">
            {t.noBriefsA}
            <Link href="/app/briefs" className="text-brand underline">
              {t.noBriefsLink}
            </Link>
            {t.noBriefsB}
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {savedBriefs.map((b) => (
              <li key={b.id}>
                <Card className="flex items-center justify-between gap-2 p-3">
                  <Link href={`/app/briefs/${b.id}`} className="text-sm font-medium hover:underline">
                    {b.topic}
                  </Link>
                  <form action={unsaveAction.bind(null, "brief", b.id)}>
                    <button type="submit" className={buttonClass("ghost", "sm")}>
                      {d.common.remove}
                    </button>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t.conversations(convs.length)}</h2>
        {convs.length === 0 ? (
          <p className="text-sm text-muted">{t.noConversations}</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {convs.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <Link href={`/app/caption-studio?c=${c.id}`} className="truncate text-sm hover:underline">
                  {c.title}
                </Link>
                <span className="shrink-0 text-xs text-muted">{formatDate(c.updatedAt, lang)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
