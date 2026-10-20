import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { BriefContentSchema, type BriefContent } from "@/lib/domain/briefs";
import { getPlatform } from "@/lib/domain/platforms";
import { getBrief, savedRefIds } from "@/lib/repo/work";
import { deleteBriefAction, sendFeedback, toggleSaveBrief } from "@/app/actions/work";
import { CopyButton } from "@/components/copy-button";
import { Badge, Button, Card, LinkButton, Notice, formatDateTime } from "@/components/ui";
import { BriefEditor } from "./brief-editor";

export const metadata = { title: "Brief" };

function briefAsText(topic: string, c: BriefContent): string {
  return [
    `Brief: ${topic}`,
    `Angle: ${c.originalAngle}`,
    `Audience: ${c.intendedAudience}`,
    `Hooks:\n${c.hooks.map((h) => `- ${h}`).join("\n")}`,
    `Opening shot: ${c.openingShot}`,
    `Beats:\n${c.beats.map((b, i) => `${i + 1}. ${b.beat}: ${b.detail}`).join("\n")}`,
    `CTA: ${c.callToAction}`,
    c.titleOptions.length ? `Titles:\n${c.titleOptions.map((t) => `- ${t}`).join("\n")}` : "",
    c.hashtags.length ? `Hashtags: ${c.hashtags.join(" ")}` : "",
    c.factsToVerify.length ? `Verify before posting:\n${c.factsToVerify.map((f) => `- ${f}`).join("\n")}` : "",
    `Low-effort version: ${c.lowEffortVersion}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export default async function BriefPage(props: PageProps<"/app/briefs/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const db = await getDb();
  const brief = await getBrief(db, user.id, id);
  if (!brief) notFound();
  const parsed = BriefContentSchema.safeParse(brief.content);
  if (!parsed.success) notFound();
  const c = parsed.data;
  const saved = (await savedRefIds(db, user.id, "brief", [brief.id])).has(brief.id);
  const save = toggleSaveBrief.bind(null, brief.id, saved);
  const del = deleteBriefAction.bind(null, brief.id);
  const fb = sendFeedback.bind(null, "brief", brief.id);
  const editing = sp.edit === "1";

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/app/briefs" className="text-sm text-brand">
        ← All briefs
      </Link>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone="brand">{getPlatform(brief.platform).label}</Badge>
        <Badge tone={brief.mode === "live_ai" ? "ok" : "warn"}>{brief.mode === "live_ai" ? "Live AI" : "Template preview — not AI"}</Badge>
        {brief.edited && <Badge>Edited by you</Badge>}
      </div>
      <h1 className="mt-2 text-2xl font-bold">{brief.topic}</h1>
      <p className="text-xs text-muted">Created {formatDateTime(brief.createdAt)}</p>
      {sp.saved && <Notice tone="ok" className="mt-3">Changes saved.</Notice>}

      <div className="mt-4 flex flex-wrap gap-2">
        <LinkButton href={`/app/caption-studio?brief=${brief.id}`}>Write caption in Studio</LinkButton>
        <LinkButton href={editing ? `/app/briefs/${brief.id}` : `/app/briefs/${brief.id}?edit=1`} variant="secondary">
          {editing ? "Cancel editing" : "Edit"}
        </LinkButton>
        <form action={save}>
          <Button variant="secondary" type="submit" aria-pressed={saved}>
            {saved ? "★ Saved" : "☆ Save"}
          </Button>
        </form>
        <CopyButton text={briefAsText(brief.topic, c)} label="Copy brief" size="md" />
      </div>

      {editing ? (
        <BriefEditor briefId={brief.id} content={c} />
      ) : (
        <div className="mt-6 space-y-4">
          <Card className="p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Original angle</h2>
            <p className="mt-1">{c.originalAngle}</p>
            <h2 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Audience</h2>
            <p className="mt-1 text-sm">{c.intendedAudience}</p>
          </Card>
          <Card className="p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Hook options</h2>
            <ul className="mt-1 space-y-1">
              {c.hooks.map((h) => (
                <li key={h} className="flex items-start justify-between gap-2 text-sm">
                  <span>{h}</span>
                  <CopyButton text={h} label="Copy" />
                </li>
              ))}
            </ul>
            <h2 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Opening shot</h2>
            <p className="mt-1 text-sm">{c.openingShot}</p>
          </Card>
          <Card className="p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Beats</h2>
            <ol className="mt-2 space-y-2">
              {c.beats.map((b, i) => (
                <li key={i} className="text-sm">
                  <span className="font-semibold">
                    {i + 1}. {b.beat}:
                  </span>{" "}
                  {b.detail}
                </li>
              ))}
            </ol>
            <h2 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Call to action</h2>
            <p className="mt-1 text-sm">{c.callToAction}</p>
          </Card>
          <Card className="p-4">
            {c.titleOptions.length > 0 && (
              <>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Title / caption options</h2>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {c.titleOptions.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </>
            )}
            {c.hashtags.length > 0 && (
              <>
                <h2 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Hashtags</h2>
                <p className="text-xs text-muted">Relevant hashtag suggestions. Current trend status not verified.</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.hashtags.map((h) => (
                    <Badge key={h}>{h}</Badge>
                  ))}
                </div>
              </>
            )}
            {c.platformNotes.length > 0 && (
              <>
                <h2 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">{getPlatform(brief.platform).label} packaging</h2>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {c.platformNotes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </>
            )}
          </Card>
          <Card className="border-warn/40 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-warn">Verify before posting</h2>
            {c.factsToVerify.length ? (
              <ul className="mt-1 list-disc pl-5 text-sm">
                {c.factsToVerify.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted">No specific factual claims flagged. Still double-check anything factual.</p>
            )}
            {c.sourceRefs.length > 0 && (
              <>
                <h2 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Source references</h2>
                <ul className="mt-1 space-y-1 text-xs">
                  {c.sourceRefs.map((s, i) => (
                    <li key={i}>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
                          {s.title}
                        </a>
                      ) : (
                        s.title
                      )}{" "}
                      — {s.sourceName}, observed {formatDateTime(s.observedAt)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
          <Card className="p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Low-effort phone version</h2>
            <p className="mt-1 text-sm">{c.lowEffortVersion}</p>
            {c.assumptions.length > 0 && <p className="mt-3 text-xs text-muted">Assumptions: {c.assumptions.join(" ")}</p>}
          </Card>
        </div>
      )}

      <Card className="mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <form action={fb} className="flex flex-wrap items-center gap-2 text-sm">
          <span>Was this brief useful?</span>
          <Button type="submit" name="verdict" value="useful" size="sm" variant="secondary">
            👍 Yes
          </Button>
          <Button type="submit" name="verdict" value="not_useful" size="sm" variant="secondary">
            👎 No
          </Button>
        </form>
        <form action={del}>
          <Button type="submit" variant="danger" size="sm">
            Delete brief
          </Button>
        </form>
      </Card>
    </div>
  );
}
