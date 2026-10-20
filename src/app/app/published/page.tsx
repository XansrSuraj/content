import { ExternalLink, Trash2 } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { getPlatform } from "@/lib/domain/platforms";
import { listVariants } from "@/lib/repo/studio";
import { listBriefs, listPublished, type PublishedPost } from "@/lib/repo/work";
import { getServerDict } from "@/lib/i18n/server";
import { deletePublishedAction, updatePublishedAction } from "@/app/actions/work";
import { Badge, Button, Card, EmptyState, Input, Notice, PageHeader, Select, formatDateTime, istNowForInput } from "@/components/ui";
import { AddPublishedForm } from "./add-form";

export async function generateMetadata() {
  const { d } = await getServerDict();
  return { title: d.published.title };
}

const MIN_ENTRIES_FOR_PATTERN = 6;
const METRICS = ["views", "likes", "comments", "shares", "saves"] as const;

/** Patterns from the creator's own manual log only — never a universal "best time". */
function ownPattern(posts: PublishedPost[]) {
  const rated = posts.filter((p) => p.outcome !== "unknown");
  if (rated.length < MIN_ENTRIES_FOR_PATTERN) return null;
  const byDay = new Map<number, { total: number; better: number }>();
  for (const p of rated) {
    const day = new Date(p.publishedAt.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getDay();
    const cur = byDay.get(day) ?? { total: 0, better: 0 };
    cur.total++;
    if (p.outcome === "better") cur.better++;
    byDay.set(day, cur);
  }
  return { rated: rated.length, rows: [...byDay.entries()].sort((a, b) => a[0] - b[0]) };
}

export default async function PublishedPage() {
  const user = await requireUser();
  const db = await getDb();
  const [posts, variants, briefs, { lang, d }] = await Promise.all([
    listPublished(db, user.id),
    listVariants(db, user.id),
    listBriefs(db, user.id),
    getServerDict(),
  ]);
  const t = d.published;
  const pattern = ownPattern(posts);
  const now = istNowForInput();

  return (
    <div className="space-y-10">
      <PageHeader title={t.title} subtitle={t.lead} />
      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 font-semibold">{t.addTitle}</h2>
        <AddPublishedForm
          variants={variants.map((v) => ({ id: v.id, label: `${v.text.slice(0, 60)}${v.text.length > 60 ? "…" : ""}` }))}
          briefs={briefs.map((b) => ({ id: b.id, topic: b.topic }))}
          today={now}
        />
      </Card>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t.logTitle}</h2>
        {pattern ? (
          <Card className="p-5">
            <p className="text-xs text-muted">{t.logNote(pattern.rated)}</p>
            <table className="mt-3 w-full max-w-md text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 font-medium">{t.day}</th>
                  <th className="font-medium">{t.postsRated}</th>
                  <th className="font-medium">{t.better}</th>
                </tr>
              </thead>
              <tbody>
                {pattern.rows.map(([day, r]) => (
                  <tr key={day} className="border-t border-line">
                    <td className="py-1.5">{t.weekdays[day]}</td>
                    <td>{r.total}</td>
                    <td>{r.better}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <Notice tone="info">{t.logNeed(MIN_ENTRIES_FOR_PATTERN)}</Notice>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t.all(posts.length)}</h2>
        {posts.length === 0 ? (
          <EmptyState title={t.emptyTitle}>{t.emptyText}</EmptyState>
        ) : (
          <ul className="space-y-3">
            {posts.map((p) => (
              <li key={p.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="brand">{getPlatform(p.platform).label}</Badge>
                    <span className="text-xs text-muted">{formatDateTime(p.publishedAt, lang)}</span>
                    {p.variantId && <Badge>{t.captionLinked}</Badge>}
                    {p.briefId && <Badge>{t.briefLinked}</Badge>}
                  </div>
                  <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-1.5 inline-flex items-center gap-1 break-all text-sm text-brand hover:underline">
                    {p.url}
                    <ExternalLink aria-hidden className="h-3 w-3 shrink-0" />
                  </a>
                  <form action={updatePublishedAction.bind(null, p.id)} className="mt-4 grid gap-3 sm:grid-cols-7">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-semibold" htmlFor={`o-${p.id}`}>
                        {t.howDid}
                      </label>
                      <Select id={`o-${p.id}`} name="outcome" defaultValue={p.outcome}>
                        {(["unknown", "better", "usual", "worse"] as const).map((k) => (
                          <option key={k} value={k}>
                            {t.outcomes[k]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {METRICS.map((k) => (
                      <div key={k}>
                        <label className="mb-1 block text-xs font-semibold" htmlFor={`${k}-${p.id}`}>
                          {t.metrics[k]}
                        </label>
                        <Input id={`${k}-${p.id}`} name={k} type="number" min={0} defaultValue={p.manualMetrics[k] ?? ""} placeholder="—" />
                      </div>
                    ))}
                    <div className="sm:col-span-7">
                      <label className="mb-1 block text-xs font-semibold" htmlFor={`n-${p.id}`}>
                        {t.notes}
                      </label>
                      <Input id={`n-${p.id}`} name="notes" defaultValue={p.notes} maxLength={1000} />
                    </div>
                    <div className="flex gap-2 sm:col-span-7">
                      <Button type="submit" size="sm" variant="secondary">
                        {t.saveFeedback}
                      </Button>
                      <Button type="submit" size="sm" variant="ghost" className="text-danger" formAction={deletePublishedAction.bind(null, p.id)}>
                        <Trash2 aria-hidden className="h-3.5 w-3.5" />
                        {d.common.delete}
                      </Button>
                    </div>
                  </form>
                  <p className="mt-2 text-[11px] text-muted">{t.manualNote}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
