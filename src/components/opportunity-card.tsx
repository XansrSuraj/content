import Link from "next/link";
import { Bookmark, BookmarkCheck } from "lucide-react";
import type { FeedItem } from "@/lib/services/discovery";
import type { RankReason } from "@/lib/domain/opportunities";
import { SOURCE_NAMES } from "@/lib/providers/trends/catalog";
import type { Dict, Lang } from "@/lib/i18n";
import { toggleSaveOpportunity } from "@/app/actions/work";
import { Badge, Card, LinkButton, buttonClass, formatDateTime } from "./ui";

export function reasonText(r: RankReason, d: Dict): string {
  const o = d.options;
  switch (r.kind) {
    case "category":
      return d.opps.reasons.category(r.values.map((v) => o.categories[v] ?? v).join(", "));
    case "language":
      return d.opps.reasons.language(r.values.map((v) => o.contentLanguages[v] ?? v).join(", "));
    case "platform":
      return d.opps.reasons.platform;
    case "saved":
      return d.opps.reasons.saved;
  }
}

export function FreshnessLabel({ item, d, lang }: { item: Pick<FeedItem, "freshness" | "evidence">; d: Dict; lang: Lang }) {
  const f = item.freshness;
  if (f.kind === "no_evidence") return <span className="text-xs text-muted">{d.opps.noObservation}</span>;
  const demo = item.evidence.some((e) => e.isDemo);
  return (
    <span className="text-xs text-muted">
      {f.kind === "stale" && <Badge tone="warn">{d.opps.stale}</Badge>} {d.opps.latestObservation(formatDateTime(f.latest, lang))}
      {demo && d.opps.demoSample}
    </span>
  );
}

export function OpportunityCard({ item, d, lang }: { item: FeedItem; d: Dict; lang: Lang }) {
  const o = item.opportunity;
  const sources = [...new Set(item.evidence.map((e) => SOURCE_NAMES[e.sourceKey] ?? e.sourceKey))];
  const save = toggleSaveOpportunity.bind(null, o.id, item.saved);
  const group = d.opps.groups[o.group];
  return (
    <Card className="flex flex-col p-5 transition-shadow hover:shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="brand">{group?.[0] ?? o.group}</Badge>
        <Badge>{d.opps.effort[o.effort] ?? o.effort}</Badge>
        {o.isDemo && <Badge tone="accent">{d.common.demo}</Badge>}
        {o.categories.slice(0, 2).map((c) => (
          <Badge key={c}>{d.options.categories[c] ?? c}</Badge>
        ))}
      </div>
      <h3 className="mt-3 text-base font-semibold leading-snug">
        <Link href={`/app/opportunities/${o.id}`} className="hover:underline">
          {o.title}
        </Link>
      </h3>
      <p className="mt-1 text-sm text-muted">{o.summary}</p>
      {item.reasons.length > 0 && (
        <p className="mt-2 text-xs text-ok">
          {d.opps.whyForYou} {item.reasons.map((r) => reasonText(r, d)).join(" · ")}
        </p>
      )}
      <div className="mt-3 space-y-1 text-xs text-muted">
        <p>
          {d.opps.evidence} <span className="font-medium text-fg">{d.opps.confidence[item.confidence]}</span>
          {sources.length > 0 && ` · ${sources.join(", ")}`}
        </p>
        <FreshnessLabel item={item} d={d} lang={lang} />
      </div>
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <LinkButton href={`/app/opportunities/${o.id}`} size="sm" variant="secondary">
          {d.opps.evidenceAngles}
        </LinkButton>
        <LinkButton href={`/app/briefs/new?opportunity=${o.id}`} size="sm">
          {d.opps.generateBrief}
        </LinkButton>
        <form action={save}>
          <button type="submit" className={buttonClass("ghost", "sm")} aria-pressed={item.saved}>
            {item.saved ? <BookmarkCheck aria-hidden className="h-4 w-4 text-brand" /> : <Bookmark aria-hidden className="h-4 w-4" />}
            {item.saved ? d.opps.savedLabel : d.opps.save}
          </button>
        </form>
      </div>
    </Card>
  );
}
