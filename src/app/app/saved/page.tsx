import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { listConversations, listVariants } from "@/lib/repo/studio";
import { listBriefs, listSaved } from "@/lib/repo/work";
import { getOpportunity } from "@/lib/repo/discovery";
import { unsaveAction } from "@/app/actions/work";
import { Card, EmptyState, LinkButton, PageHeader, buttonClass, formatDate } from "@/components/ui";
import { VariantItem } from "./variant-item";

export const metadata = { title: "Saved" };

export default async function SavedPage() {
  const user = await requireUser();
  const db = await getDb();
  const [saved, variants, briefs, convs] = await Promise.all([
    listSaved(db, user.id),
    listVariants(db, user.id),
    listBriefs(db, user.id),
    listConversations(db, user.id),
  ]);
  const dataset = user.isDemo && config().demoEnabled ? "any" : "observed";
  const opps = (
    await Promise.all(saved.filter((s) => s.kind === "opportunity").map((s) => getOpportunity(db, s.refId, dataset)))
  ).filter((o) => o !== null);
  const savedBriefIds = new Set(saved.filter((s) => s.kind === "brief").map((s) => s.refId));
  const savedBriefs = briefs.filter((b) => savedBriefIds.has(b.id));

  return (
    <div className="space-y-8">
      <PageHeader title="Saved work" subtitle="Your saved captions, ideas and briefs. Private to your account." />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Captions ({variants.length})</h2>
        {variants.length === 0 ? (
          <EmptyState title="No saved captions" action={<LinkButton href="/app/caption-studio">Open Caption Studio</LinkButton>}>
            Press “Save” on any caption option to keep it here.
          </EmptyState>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {variants.map((v) => (
              <VariantItem
                key={v.id}
                v={{ id: v.id, label: v.label, platform: v.platform, text: v.text, hashtags: v.hashtags, edited: v.edited, conversationId: v.conversationId, date: formatDate(v.updatedAt) }}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Opportunities ({opps.length})</h2>
        {opps.length === 0 ? (
          <p className="text-sm text-muted">No saved opportunities.</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {opps.map((o) => (
              <li key={o.id}>
                <Card className="flex items-center justify-between gap-2 p-3">
                  <Link href={`/app/opportunities/${o.id}`} className="text-sm font-medium hover:underline">
                    {o.title} {o.isDemo && <span className="text-xs text-accent">(demo)</span>}
                  </Link>
                  <form action={unsaveAction.bind(null, "opportunity", o.id)}>
                    <button type="submit" className={buttonClass("ghost", "sm")}>Remove</button>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Saved briefs ({savedBriefs.length})</h2>
        {savedBriefs.length === 0 ? (
          <p className="text-sm text-muted">
            No saved briefs. All your briefs are on the <Link href="/app/briefs" className="text-brand underline">Briefs</Link> page.
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {savedBriefs.map((b) => (
              <li key={b.id}>
                <Card className="flex items-center justify-between gap-2 p-3">
                  <Link href={`/app/briefs/${b.id}`} className="text-sm font-medium hover:underline">{b.topic}</Link>
                  <form action={unsaveAction.bind(null, "brief", b.id)}>
                    <button type="submit" className={buttonClass("ghost", "sm")}>Remove</button>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Caption conversations ({convs.length})</h2>
        {convs.length === 0 ? (
          <p className="text-sm text-muted">Conversations are saved automatically when you use Caption Studio.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {convs.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-2">
                <Link href={`/app/caption-studio?c=${c.id}`} className="text-sm hover:underline">{c.title}</Link>
                <span className="text-xs text-muted">{formatDate(c.updatedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
