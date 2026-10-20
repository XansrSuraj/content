"use client";

import { ChevronDown, ExternalLink, Info } from "lucide-react";
import type { EvidenceBundle, EvidenceCategory } from "@/lib/domain/evidence";
import { useI18n } from "@/components/i18n-provider";
import { Badge, formatDateTime } from "@/components/ui";

const PROVIDER_NAME: Record<string, string> = { openfootball: "openfootball", openligadb: "OpenLigaDB", football_data: "football-data.org", cricapi: "CricketData.org" };

const ORDER: EvidenceCategory[] = ["match_fact", "search_interest", "platform_observation", "creator_reference"];
const TONE = { match_fact: "ok", search_interest: "info", platform_observation: "brand", creator_reference: "neutral", generated_suggestion: "neutral" } as const;

/** The gated evidence behind one answer, one group per category, with what was left out and why. */
export function EvidenceSection({ bundle }: { bundle: EvidenceBundle }) {
  const { d, lang } = useI18n();
  const t = d.evidence;
  const groups = ORDER.map((c) => [c, bundle.items.filter((i) => i.category === c)] as const).filter(([, items]) => items.length > 0);

  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t.title}</p>
      {bundle.noTrendReason && (
        <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-surface-2 p-2 text-xs">
          <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
          <span>
            <span className="font-semibold">{t.noTrendTitle}.</span> {bundle.noTrendReason}
          </span>
        </p>
      )}
      <div className="space-y-2">
        {groups.map(([cat, items]) => (
          <div key={cat}>
            <Badge tone={TONE[cat]}>{t.cats[cat]}</Badge>
            <ul className="mt-1 space-y-1.5">
              {items.map((i) => (
                <li key={i.id} className="rounded-lg border border-line p-2 text-xs">
                  <span className="font-semibold">{i.title}</span>
                  {i.isDemo && (
                    <Badge tone="accent" className="ml-1">
                      {d.result.tagDemo}
                    </Badge>
                  )}
                  {i.category === "match_fact" ? (
                    <span className="block text-muted">
                      {d.sports.startsAt(formatDateTime(i.observedAt, lang))} · {d.sports.checked(formatDateTime(i.checkedAt, lang))} ·{" "}
                      {i.origin === "creator" ? d.sports.creatorEntered : d.sports.source(PROVIDER_NAME[i.source] ?? i.source)}
                    </span>
                  ) : (
                    <span className="block text-muted">
                      {i.source} · {i.region} · {t.observed} {formatDateTime(i.observedAt, lang)} · {t.checked} {formatDateTime(i.checkedAt, lang)} ·{" "}
                      {t.origin[i.origin]}
                    </span>
                  )}
                  {i.metric && <span className="block text-muted">{i.metric.scope}</span>}
                  {i.sourceUrl && (
                    <a href={i.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-0.5 inline-flex items-center gap-1 text-brand">
                      {d.common.source}
                      <ExternalLink aria-hidden className="h-3 w-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {bundle.rejected.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="flex cursor-pointer items-center gap-1 text-muted">
            <ChevronDown aria-hidden className="h-3 w-3" />
            {t.leftOut(bundle.rejected.length)}
          </summary>
          <p className="mt-1 text-muted">{t.leftOutHint}</p>
          <ul className="mt-1 space-y-0.5">
            {bundle.rejected.map((r, idx) => (
              <li key={idx}>
                <span className="font-medium">{r.title}</span> <span className="text-muted">({r.source}) — {r.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
