import Link from "next/link";
import { sql, gte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { usageRecords } from "@/lib/db/schema";
import { INGESTIBLE_KEYS } from "@/lib/jobs/ingest";
import { listAllOpportunitiesForAdmin, listObservations, listRuns } from "@/lib/repo/discovery";
import { SOURCE_NAMES } from "@/lib/providers/trends/catalog";
import { providerStatus } from "@/lib/services/status";
import { cleanupDemoAction, runSourceNow, setStatusAction } from "@/app/actions/admin";
import { Badge, Button, Card, LinkButton, Notice, PageHeader, daysAgo, formatDateTime } from "@/components/ui";

export const metadata = { title: "Admin" };

export default async function AdminPage(props: PageProps<"/admin">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const db = await getDb();
  const since = daysAgo(7);
  const [status, runs, observations, opps, usage] = await Promise.all([
    providerStatus(db),
    listRuns(db, 15),
    listObservations(db, { limit: 60 }),
    listAllOpportunitiesForAdmin(db),
    db
      .select({
        day: sql<string>`to_char(${usageRecords.createdAt}, 'YYYY-MM-DD')`,
        kind: usageRecords.kind,
        status: usageRecords.status,
        n: sql<number>`count(*)::int`,
        inTok: sql<number>`coalesce(sum(${usageRecords.inputTokens}),0)::int`,
        outTok: sql<number>`coalesce(sum(${usageRecords.outputTokens}),0)::int`,
      })
      .from(usageRecords)
      .where(gte(usageRecords.createdAt, since))
      .groupBy(sql`1`, usageRecords.kind, usageRecords.status)
      .orderBy(sql`1 desc`),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <Link href="/app" className="text-sm text-brand">← Back to app</Link>
      </div>
      <PageHeader title="Research & admin" subtitle="Source health, ingestion, curation of observed signals into opportunities, and aggregate usage. No caption content is shown here." />
      {sp.ingest && <Notice tone={sp.ingest === "success" ? "ok" : "warn"}>Ingestion: {String(sp.ingest)}{sp.new ? ` · ${sp.new} new observations` : ""}</Notice>}
      {sp.promoted && <Notice tone="ok">Opportunity published.</Notice>}
      {sp.demoCleaned && <Notice tone="ok">Removed {String(sp.demoCleaned)} expired demo accounts.</Notice>}

      <Card className="p-4">
        <h2 className="font-semibold">Sources</h2>
        <ul className="mt-2 grid gap-2 md:grid-cols-2">
          {status.sources.map((s) => (
            <li key={s.key} className="rounded-lg border border-line p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{s.name}</span>
                <Badge tone={s.status === "enabled" ? "ok" : s.status === "needs_config" ? "warn" : "neutral"}>{s.status}</Badge>
                {s.stale && <Badge tone="warn">stale</Badge>}
              </div>
              {s.missing.length > 0 && <p className="mt-1 text-xs text-muted">Requires: {s.missing.join("; ")}</p>}
              {s.lastSuccessAt && <p className="mt-1 text-xs">Last success: {formatDateTime(s.lastSuccessAt)}</p>}
              {s.lastError && <p className="mt-1 text-xs text-danger">Last error: {s.lastError}</p>}
              {(INGESTIBLE_KEYS as readonly string[]).includes(s.key) && s.status === "enabled" && (
                <form action={runSourceNow.bind(null, s.key)} className="mt-2">
                  <Button type="submit" size="sm" variant="secondary">Run now</Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="overflow-x-auto p-4">
        <h2 className="font-semibold">Recent ingestion runs</h2>
        {runs.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No runs yet. Use “Run now”, `npm run ingest`, or the scheduled endpoint.</p>
        ) : (
          <table className="mt-2 w-full text-left text-xs">
            <thead className="text-muted">
              <tr><th className="py-1">Started</th><th>Source</th><th>Trigger</th><th>Status</th><th>Attempts</th><th>Fetched</th><th>New</th><th>Error</th></tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-1">{formatDateTime(r.startedAt)}</td>
                  <td>{SOURCE_NAMES[r.sourceKey] ?? r.sourceKey}</td>
                  <td>{r.trigger}</td>
                  <td>{r.status}</td>
                  <td>{r.attempts}</td>
                  <td>{r.itemsFetched}</td>
                  <td>{r.itemsNew}</td>
                  <td className="max-w-xs truncate">{r.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Recent observations (real sources)</h2>
          <LinkButton href="/admin/promote" size="sm">Create opportunity</LinkButton>
        </div>
        <p className="mt-1 text-xs text-muted">Raw signals. Review before promoting: people, crime, tragedies and politics need extra care.</p>
        {observations.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No observations stored.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line text-sm">
            {observations.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <span className="w-8 text-xs text-muted">#{o.rank ?? "?"}</span>
                <span className="min-w-0 flex-1 truncate">{o.title}</span>
                <span className="text-xs text-muted">{SOURCE_NAMES[o.sourceKey] ?? o.sourceKey} · {o.geo} · {formatDateTime(o.observedAt)}</span>
                <Link href={`/admin/promote?obs=${o.id}`} className="text-xs font-semibold text-brand underline">Promote</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold">Published opportunities (real)</h2>
        {opps.length === 0 ? (
          <p className="mt-1 text-sm text-muted">None yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line text-sm">
            {opps.map((o) => (
              <li key={o.id} className="flex items-center gap-2 py-1.5">
                <Badge tone={o.status === "published" ? "ok" : "neutral"}>{o.status}</Badge>
                <Link href={`/app/opportunities/${o.id}`} className="flex-1 truncate hover:underline">{o.title}</Link>
                <form action={setStatusAction.bind(null, o.id, o.status === "published" ? "archived" : "published")}>
                  <Button type="submit" size="sm" variant="ghost">{o.status === "published" ? "Archive" : "Publish"}</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-x-auto p-4">
        <h2 className="font-semibold">AI usage (last 7 days, all users, aggregate)</h2>
        {usage.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No usage recorded.</p>
        ) : (
          <table className="mt-2 w-full text-left text-xs">
            <thead className="text-muted"><tr><th className="py-1">Day (UTC)</th><th>Kind</th><th>Status</th><th>Requests</th><th>Input tokens</th><th>Output tokens</th></tr></thead>
            <tbody>
              {usage.map((u, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1">{u.day}</td><td>{u.kind}</td><td>{u.status}</td><td>{u.n}</td><td>{u.inTok.toLocaleString("en-IN")}</td><td>{u.outTok.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold">Maintenance</h2>
        <form action={cleanupDemoAction} className="mt-2">
          <Button type="submit" size="sm" variant="secondary">Delete demo accounts older than 3 days</Button>
        </form>
      </Card>
    </main>
  );
}
