import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bookmark, BookmarkCheck, PenLine, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { BriefContentSchema, type BriefContent } from "@/lib/domain/briefs";
import { getPlatform } from "@/lib/domain/platforms";
import { getBrief, savedRefIds } from "@/lib/repo/work";
import { getServerDict } from "@/lib/i18n/server";
import type { Dict } from "@/lib/i18n";
import { deleteBriefAction, sendFeedback, toggleSaveBrief } from "@/app/actions/work";
import { CopyButton } from "@/components/copy-button";
import { Badge, ModeBadge, Button, Card, LinkButton, Notice, formatDateTime } from "@/components/ui";
import { BriefEditor } from "./brief-editor";

export async function generateMetadata() {
  const { d } = await getServerDict();
  return { title: d.briefs.title };
}

function briefAsText(topic: string, c: BriefContent, d: Dict): string {
  const s = d.briefs.sections;
  return [
    `${d.briefs.topic}: ${topic}`,
    `${s.angle}: ${c.originalAngle}`,
    `${s.audience}: ${c.intendedAudience}`,
    `${s.hooks}:\n${c.hooks.map((h) => `- ${h}`).join("\n")}`,
    `${s.openingShot}: ${c.openingShot}`,
    `${s.beats}:\n${c.beats.map((b, i) => `${i + 1}. ${b.beat}: ${b.detail}`).join("\n")}`,
    `${s.cta}: ${c.callToAction}`,
    c.titleOptions.length ? `${s.titles}:\n${c.titleOptions.map((t) => `- ${t}`).join("\n")}` : "",
    c.hashtags.length ? `${s.hashtags}: ${c.hashtags.join(" ")}` : "",
    c.factsToVerify.length ? `${s.verify}:\n${c.factsToVerify.map((f) => `- ${f}`).join("\n")}` : "",
    `${s.lowEffort}: ${c.lowEffortVersion}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const H = "text-xs font-semibold uppercase tracking-wide text-muted";

export default async function BriefPage(props: PageProps<"/app/briefs/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const db = await getDb();
  const [brief, { lang, d }] = await Promise.all([getBrief(db, user.id, id), getServerDict()]);
  if (!brief) notFound();
  const parsed = BriefContentSchema.safeParse(brief.content);
  if (!parsed.success) notFound();
  const c = parsed.data;
  const t = d.briefs;
  const s = t.sections;
  const saved = (await savedRefIds(db, user.id, "brief", [brief.id])).has(brief.id);
  const save = toggleSaveBrief.bind(null, brief.id, saved);
  const del = deleteBriefAction.bind(null, brief.id);
  const fb = sendFeedback.bind(null, "brief", brief.id);
  const editing = sp.edit === "1";
  const SaveIcon = saved ? BookmarkCheck : Bookmark;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/app/briefs" className="inline-flex items-center gap-1 text-sm font-medium text-brand">
        <ArrowLeft aria-hidden className="h-4 w-4" />
        {t.all}
      </Link>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Badge tone="brand">{getPlatform(brief.platform).label}</Badge>
        <ModeBadge mode={brief.mode} label={d.modes[brief.mode]} />
        {brief.edited && <Badge>{t.edited}</Badge>}
      </div>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">{brief.topic}</h1>
      <p className="text-xs text-muted">{t.created(formatDateTime(brief.createdAt, lang))}</p>
      {sp.saved && (
        <Notice tone="ok" className="mt-3">
          {t.savedChanges}
        </Notice>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <LinkButton href={`/app/caption-studio?brief=${brief.id}`}>
          <PenLine aria-hidden className="h-4 w-4" />
          {t.writeCaption}
        </LinkButton>
        <LinkButton href={editing ? `/app/briefs/${brief.id}` : `/app/briefs/${brief.id}?edit=1`} variant="secondary">
          {editing ? t.cancelEdit : d.common.edit}
        </LinkButton>
        <form action={save}>
          <Button variant="secondary" type="submit" aria-pressed={saved}>
            <SaveIcon aria-hidden className="h-4 w-4" />
            {saved ? d.opps.savedLabel : d.opps.save}
          </Button>
        </form>
        <CopyButton text={briefAsText(brief.topic, c, d)} label={t.copyBrief} size="md" />
      </div>

      {editing ? (
        <BriefEditor briefId={brief.id} content={c} />
      ) : (
        <div className="mt-6 space-y-4">
          <Card className="p-5">
            <h2 className={H}>{s.angle}</h2>
            <p className="mt-1">{c.originalAngle}</p>
            <h2 className={`mt-4 ${H}`}>{s.audience}</h2>
            <p className="mt-1 text-sm">{c.intendedAudience}</p>
          </Card>
          <Card className="p-5">
            <h2 className={H}>{s.hooks}</h2>
            <ul className="mt-1 space-y-1">
              {c.hooks.map((h) => (
                <li key={h} className="flex items-start justify-between gap-2 text-sm">
                  <span>{h}</span>
                  <CopyButton text={h} label={d.common.copy} variant="ghost" />
                </li>
              ))}
            </ul>
            <h2 className={`mt-4 ${H}`}>{s.openingShot}</h2>
            <p className="mt-1 text-sm">{c.openingShot}</p>
          </Card>
          <Card className="p-5">
            <h2 className={H}>{s.beats}</h2>
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
            <h2 className={`mt-4 ${H}`}>{s.cta}</h2>
            <p className="mt-1 text-sm">{c.callToAction}</p>
          </Card>
          <Card className="p-5">
            {c.titleOptions.length > 0 && (
              <>
                <h2 className={H}>{s.titles}</h2>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {c.titleOptions.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </>
            )}
            {c.hashtags.length > 0 && (
              <>
                <h2 className={`mt-4 ${H}`}>{s.hashtags}</h2>
                <p className="text-xs text-muted">{d.result.notVerified}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.hashtags.map((h) => (
                    <Badge key={h}>{h}</Badge>
                  ))}
                </div>
              </>
            )}
            {c.platformNotes.length > 0 && (
              <>
                <h2 className={`mt-4 ${H}`}>{s.packaging(getPlatform(brief.platform).label)}</h2>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {c.platformNotes.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </>
            )}
          </Card>
          <Card className="border-warn/40 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-warn">{s.verify}</h2>
            {c.factsToVerify.length ? (
              <ul className="mt-1 list-disc pl-5 text-sm">
                {c.factsToVerify.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted">{s.noFacts}</p>
            )}
            {c.sourceRefs.length > 0 && (
              <>
                <h2 className={`mt-4 ${H}`}>{s.sources}</h2>
                <ul className="mt-1 space-y-1 text-xs">
                  {c.sourceRefs.map((r, i) => (
                    <li key={i}>
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline">
                          {r.title}
                        </a>
                      ) : (
                        r.title
                      )}{" "}
                      — {r.sourceName}, {t.observedOn(formatDateTime(r.observedAt, lang))}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
          <Card className="p-5">
            <h2 className={H}>{s.lowEffort}</h2>
            <p className="mt-1 text-sm">{c.lowEffortVersion}</p>
            {c.assumptions.length > 0 && (
              <p className="mt-3 text-xs text-muted">
                {s.assumptions} {c.assumptions.join(" ")}
              </p>
            )}
          </Card>
        </div>
      )}

      <Card className="mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <form action={fb} className="flex flex-wrap items-center gap-2 text-sm">
          <span>{t.useful}</span>
          <Button type="submit" name="verdict" value="useful" size="sm" variant="secondary" aria-label={d.common.yes}>
            <ThumbsUp aria-hidden className="h-4 w-4" />
            {d.common.yes}
          </Button>
          <Button type="submit" name="verdict" value="not_useful" size="sm" variant="secondary" aria-label={d.common.no}>
            <ThumbsDown aria-hidden className="h-4 w-4" />
            {d.common.no}
          </Button>
        </form>
        <form action={del}>
          <Button type="submit" variant="danger" size="sm">
            <Trash2 aria-hidden className="h-4 w-4" />
            {t.deleteBrief}
          </Button>
        </form>
      </Card>
    </div>
  );
}
