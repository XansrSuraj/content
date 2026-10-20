import Link from "next/link";
import type { FeedItem } from "@/lib/services/discovery";
import { CONFIDENCE_COPY } from "@/lib/domain/opportunities";
import { CATEGORIES } from "@/lib/domain/options";
import { SOURCE_NAMES } from "@/lib/providers/trends/catalog";
import { toggleSaveOpportunity } from "@/app/actions/work";
import { Badge, Card, LinkButton, buttonClass, formatDateTime } from "./ui";

const GROUP_LABEL = { timely: "Timely", plan: "Worth planning", evergreen: "Evergreen" } as const;
const EFFORT_LABEL = { low: "Low effort", medium: "Medium effort", high: "High effort" } as const;

export function FreshnessLabel({ item }: { item: Pick<FeedItem, "freshness" | "evidence"> }) {
  const f = item.freshness;
  if (f.kind === "no_evidence") return <span className="text-xs text-muted">No source observation — idea only</span>;
  const demo = item.evidence.some((e) => e.isDemo);
  return (
    <span className="text-xs text-muted">
      {f.kind === "stale" && <Badge tone="warn">Source data stale</Badge>} Latest observation {formatDateTime(f.latest)}
      {demo && " (demo sample)"}
    </span>
  );
}

export function OpportunityCard({ item }: { item: FeedItem }) {
  const o = item.opportunity;
  const sources = [...new Set(item.evidence.map((e) => SOURCE_NAMES[e.sourceKey] ?? e.sourceKey))];
  const save = toggleSaveOpportunity.bind(null, o.id, item.saved);
  return (
    <Card className="flex flex-col p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="brand">{GROUP_LABEL[o.group]}</Badge>
        <Badge>{EFFORT_LABEL[o.effort]}</Badge>
        {o.isDemo && <Badge tone="accent">Demo</Badge>}
        {o.categories.slice(0, 2).map((c) => (
          <Badge key={c}>{CATEGORIES.find((x) => x.id === c)?.hinglish ?? c}</Badge>
        ))}
      </div>
      <h3 className="mt-2 text-base font-semibold">
        <Link href={`/app/opportunities/${o.id}`} className="hover:underline">
          {o.title}
        </Link>
      </h3>
      <p className="mt-1 text-sm text-muted">{o.summary}</p>
      {item.reasons.length > 0 && <p className="mt-2 text-xs text-ok">Why for you: {item.reasons.join(" · ")}</p>}
      <div className="mt-3 space-y-1 text-xs text-muted">
        <p>
          Evidence: <span className="font-medium text-fg">{CONFIDENCE_COPY[item.confidence]}</span>
          {sources.length > 0 && ` · ${sources.join(", ")}`}
        </p>
        <FreshnessLabel item={item} />
      </div>
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <LinkButton href={`/app/opportunities/${o.id}`} size="sm" variant="secondary">
          Evidence & angles
        </LinkButton>
        <LinkButton href={`/app/briefs/new?opportunity=${o.id}`} size="sm">
          Generate brief
        </LinkButton>
        <form action={save}>
          <button type="submit" className={buttonClass("ghost", "sm")} aria-pressed={item.saved}>
            {item.saved ? "★ Saved" : "☆ Save"}
          </button>
        </form>
      </div>
    </Card>
  );
}
