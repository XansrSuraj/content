import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { getPlatform } from "@/lib/domain/platforms";
import { listVariants } from "@/lib/repo/studio";
import { listBriefs, listPublished, type PublishedPost } from "@/lib/repo/work";
import { deletePublishedAction, updatePublishedAction } from "@/app/actions/work";
import { Badge, Button, Card, EmptyState, Input, Notice, PageHeader, Select, formatDateTime, istNowForInput } from "@/components/ui";
import { AddPublishedForm } from "./add-form";

export const metadata = { title: "Published" };

const MIN_ENTRIES_FOR_PATTERN = 6;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  const [posts, variants, briefs] = await Promise.all([listPublished(db, user.id), listVariants(db, user.id), listBriefs(db, user.id)]);
  const pattern = ownPattern(posts);
  const now = istNowForInput();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Published posts"
        subtitle="Record what you posted and how it felt it went. Numbers here are only what you type in — no platform analytics are connected."
      />
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Add a published link</h2>
        <AddPublishedForm
          variants={variants.map((v) => ({ id: v.id, label: `${v.text.slice(0, 60)}${v.text.length > 60 ? "…" : ""}` }))}
          briefs={briefs.map((b) => ({ id: b.id, topic: b.topic }))}
          today={now}
        />
      </Card>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Your posting log</h2>
        {pattern ? (
          <Card className="p-4">
            <p className="text-xs text-muted">
              From {pattern.rated} of your own entries where you rated the outcome. This is your personal record, not a
              platform recommendation, and day-of-week is only one of many factors.
            </p>
            <table className="mt-3 w-full max-w-md text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1">Day (IST)</th>
                  <th>Posts rated</th>
                  <th>Rated “better than usual”</th>
                </tr>
              </thead>
              <tbody>
                {pattern.rows.map(([day, r]) => (
                  <tr key={day} className="border-t border-line">
                    <td className="py-1">{WEEKDAYS[day]}</td>
                    <td>{r.total}</td>
                    <td>{r.better}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <Notice tone="info">
            Add and rate at least {MIN_ENTRIES_FOR_PATTERN} posts to see patterns from your own log. TrendSaathi doesn&apos;t
            claim a universal best posting time.
          </Notice>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">All posts ({posts.length})</h2>
        {posts.length === 0 ? (
          <EmptyState title="No published posts yet">After you post, paste the link here to track what worked for you.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {posts.map((p) => (
              <li key={p.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="brand">{getPlatform(p.platform).label}</Badge>
                    <span className="text-xs text-muted">{formatDateTime(p.publishedAt)}</span>
                    {p.variantId && <Badge>Caption linked</Badge>}
                    {p.briefId && <Badge>Brief linked</Badge>}
                  </div>
                  <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 block break-all text-sm text-brand underline">
                    {p.url}
                  </a>
                  <form action={updatePublishedAction.bind(null, p.id)} className="mt-3 grid gap-2 sm:grid-cols-7">
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold" htmlFor={`o-${p.id}`}>How did it do (your view)?</label>
                      <Select id={`o-${p.id}`} name="outcome" defaultValue={p.outcome}>
                        <option value="unknown">Not rated</option>
                        <option value="better">Better than usual</option>
                        <option value="usual">About usual</option>
                        <option value="worse">Worse than usual</option>
                      </Select>
                    </div>
                    {(["views", "likes", "comments", "shares", "saves"] as const).map((k) => (
                      <div key={k}>
                        <label className="text-xs font-semibold capitalize" htmlFor={`${k}-${p.id}`}>{k}</label>
                        <Input id={`${k}-${p.id}`} name={k} type="number" min={0} defaultValue={p.manualMetrics[k] ?? ""} placeholder="—" />
                      </div>
                    ))}
                    <div className="sm:col-span-7">
                      <label className="text-xs font-semibold" htmlFor={`n-${p.id}`}>Notes</label>
                      <Input id={`n-${p.id}`} name="notes" defaultValue={p.notes} maxLength={1000} />
                    </div>
                    <div className="flex gap-2 sm:col-span-7">
                      <Button type="submit" size="sm" variant="secondary">Save feedback</Button>
                      <Button type="submit" size="sm" variant="ghost" className="text-danger" formAction={deletePublishedAction.bind(null, p.id)}>
                        Delete
                      </Button>
                    </div>
                  </form>
                  <p className="mt-1 text-[11px] text-muted">Manually entered by you · not platform data.</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
