"use client";

import { useRef, useState } from "react";
import { captionWithHashtags, type CaptionResult } from "@/lib/domain/captions";
import { dedupeHashtags, hashtagsForCopy } from "@/lib/domain/hashtags";
import { getPlatform } from "@/lib/domain/platforms";
import type { ClientHashtagStatus, ClientMessage } from "@/lib/services/serialize";
import { Check, ChevronDown, ChevronUp, CircleAlert, Dot, Pencil } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { CopyButton } from "@/components/copy-button";
import { SportsPanel, type SportsPanelHandle } from "./sports-panel";
import { EvidenceSection } from "./evidence-section";
import { Badge, Button, Card, Textarea, cx, formatDateTime } from "@/components/ui";

const MODE_TONE = {
  live_ai: "ok",
  open_model: "ok",
  local_ai: "info",
  template_preview: "warn",
  example: "accent",
} as const;

export function ResultCard({
  message,
  result,
  conversationId,
  platformId,
  outputMode,
  compact = false,
  onChooseMatch,
  onRefreshMatch,
}: {
  message: ClientMessage;
  result: CaptionResult;
  conversationId: string;
  platformId: string;
  outputMode: "full" | "final_only";
  /** Older replies collapse to the recommended caption, like chat apps keep history scannable. */
  compact?: boolean;
  onChooseMatch?: (matchId: string, vs: string) => void;
  onRefreshMatch?: () => void;
}) {
  const sportsRef = useRef<SportsPanelHandle>(null);
  const { d } = useI18n();
  const r = d.result;
  const platform = getPlatform(platformId);
  const mode = message.mode ? { tone: MODE_TONE[message.mode], text: d.modes[message.mode] } : null;
  const [showAll, setShowAll] = useState(outputMode === "full");
  const [expanded, setExpanded] = useState(false);
  const recommended = result.variants.find((v) => v.id === result.recommendedVariantId) ?? result.variants[0];
  const ordered = [recommended, ...result.variants.filter((v) => v.id !== recommended.id)];
  const statusByTag = new Map(message.hashtags.map((h) => [h.tag.toLowerCase(), h]));
  const allText = ordered.map((v) => `${r.option(v.id)} (${v.approach}):\n${captionWithHashtags(v.caption, v.hashtags)}`).join("\n\n");

  if (compact && !expanded) {
    return (
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-4 py-2">
          {mode && <Badge tone={mode.tone}>{mode.text}</Badge>}
          <span className="text-xs text-muted">{r.recommendedShort(recommended.id, recommended.approach)}</span>
        </div>
        <div className="p-4">
          <p className="line-clamp-4 whitespace-pre-wrap text-[15px] leading-relaxed">{recommended.caption}</p>
          <p className="mt-1 truncate text-xs text-muted">{recommended.hashtags.join(" ")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CopyButton text={captionWithHashtags(recommended.caption, recommended.hashtags)} label={d.common.copy} />
            <Button size="sm" variant="ghost" onClick={() => setExpanded(true)}>
              <ChevronDown aria-hidden className="h-3.5 w-3.5" />
              {r.showAll}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="max-w-3xl overflow-hidden" onClickCapture={() => sportsRef.current?.check()}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-4 py-2">
        {mode && <Badge tone={mode.tone}>{mode.text}</Badge>}
        <span className="text-xs text-muted">{r.forPlatform(platform.label)}</span>
        <span className="ml-auto flex items-center gap-1">
          <CopyButton text={allText} label={r.copyAll} variant="ghost" />
          {compact && (
            <Button size="sm" variant="ghost" onClick={() => setExpanded(false)}>
              <ChevronUp aria-hidden className="h-3.5 w-3.5" />
              {r.collapse}
            </Button>
          )}
        </span>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{r.understood}</p>
          <p className="text-sm">{result.topicSummary}</p>
        </div>

        {message.sports && (
          <SportsPanel
            ref={sportsRef}
            sports={message.sports}
            isLatest={!compact}
            onChooseMatch={(id, vs) => onChooseMatch?.(id, vs)}
            onRefresh={() => onRefreshMatch?.()}
          />
        )}

        {(result.assumptions.length > 0 || result.clarifyingQuestion) && outputMode === "full" && (
          <div className="rounded-lg bg-info-soft p-3 text-sm">
            {result.assumptions.map((a) => (
              <p key={a}>
                <span className="font-semibold">{r.assumption}</span> {a}
              </p>
            ))}
            {result.clarifyingQuestion && (
              <p className="mt-1">
                <span className="font-semibold">{r.question}</span> {result.clarifyingQuestion}
              </p>
            )}
          </div>
        )}

        <div className="space-y-3">
          {(showAll ? ordered : [recommended]).map((v) => (
            <VariantBlock
              key={v.id}
              variant={v}
              recommended={v.id === recommended.id}
              reason={v.id === recommended.id ? result.recommendationReason : null}
              conversationId={conversationId}
              messageId={message.id}
              platformId={platformId}
              statusByTag={statusByTag}
              trendTitles={(message.contextUsed ?? []).map((c) => c.title)}
            />
          ))}
          {result.platformVersions.length > 0 && <PlatformVersions versions={result.platformVersions} />}
          {!showAll && (
            <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
              <ChevronDown aria-hidden className="h-3.5 w-3.5" />
              {r.showOther}
            </Button>
          )}
        </div>

        {outputMode === "full" && (
          <>
            {result.hooks.length > 0 && (
              <Section title={r.hooks}>
                <ul className="space-y-1">
                  {result.hooks.map((h) => (
                    <li key={h} className="flex items-start justify-between gap-2 text-sm">
                      <span>{h}</span>
                      <CopyButton text={h} label={d.common.copy} />
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {message.evidence ? <EvidenceSection bundle={message.evidence} /> : <TrendContextSection items={message.contextUsed} />}

            <HashtagSection result={result} statuses={message.hashtags} platformId={platformId} />

            {result.keywords.length > 0 && (
              <Section title={r.searchPhrases}>
                <div className="flex flex-wrap gap-1">
                  {result.keywords.map((k) => (
                    <Badge key={k}>{k}</Badge>
                  ))}
                </div>
              </Section>
            )}

            {result.improvements.length > 0 && (
              <Section title={r.whatChanged}>
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {result.improvements.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}

        {result.limitations.length > 0 && (
          <div className="rounded-lg bg-warn-soft p-3 text-sm text-warn">
            {result.limitations.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      {children}
    </div>
  );
}

function TagChip({ tag, status }: { tag: string; status?: ClientHashtagStatus }) {
  const { d } = useI18n();
  const tone = status?.status === "verified" ? "ok" : status?.status === "search_interest" ? "info" : status?.status === "demo" ? "accent" : "neutral";
  const label =
    status?.status === "verified"
      ? d.result.tagObserved
      : status?.status === "search_interest"
        ? d.result.tagSearch
        : status?.status === "demo"
          ? d.result.tagDemo
          : null;
  return (
    <Badge tone={tone} title={label ?? d.result.tagSuggestion}>
      {tag}
      {label && <span className="text-[10px] uppercase">· {label}</span>}
    </Badge>
  );
}

function VariantBlock({
  variant,
  recommended,
  reason,
  conversationId,
  messageId,
  platformId,
  statusByTag,
  trendTitles,
}: {
  variant: CaptionResult["variants"][number];
  recommended: boolean;
  reason: string | null;
  conversationId: string;
  messageId: string;
  platformId: string;
  statusByTag: Map<string, ClientHashtagStatus>;
  trendTitles: string[];
}) {
  const { d } = useI18n();
  const r = d.result;
  const platform = getPlatform(platformId);
  const rule = platform.hashtagRule;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(variant.caption);
  const [tagsText, setTagsText] = useState(variant.hashtags.join(" "));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const tags = dedupeHashtags(tagsText.split(/\s+/));
  const copyTags = hashtagsForCopy(tags, rule.copyDefault, rule.hardLimit);
  const overLimit = rule.hardLimit !== null && tags.length > rule.hardLimit;

  async function save() {
    setSaveState("saving");
    const res = await fetch("/api/variants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, messageId, variantId: variant.id, platform: platformId, text, hashtags: tags }),
    });
    setSaveState(res.ok ? "saved" : "error");
    if (res.ok) setEditing(false);
  }

  return (
    <div className={cx("rounded-lg border p-3", recommended ? "border-brand bg-brand-soft/40" : "border-line")}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">{r.option(variant.id)}</span>
        <Badge tone="brand">{variant.approach}</Badge>
        {recommended && <Badge tone="ok">{r.recommended}</Badge>}
      </div>
      {reason && (
        <p className="mb-2 text-xs text-muted">
          {r.why} {reason}
        </p>
      )}

      {editing ? (
        <div className="space-y-2">
          <label className="sr-only" htmlFor={`edit-${messageId}-${variant.id}`}>
            {r.editCaption}
          </label>
          <Textarea id={`edit-${messageId}-${variant.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={2200} />
          <label className="text-xs font-semibold" htmlFor={`tags-${messageId}-${variant.id}`}>
            {r.hashtagsSpace}
          </label>
          <Textarea id={`tags-${messageId}-${variant.id}`} value={tagsText} onChange={(e) => setTagsText(e.target.value)} rows={2} className="min-h-0" />
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{text}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        {tags.map((t) => (
          <TagChip key={t} tag={t} status={statusByTag.get(t.toLowerCase())} />
        ))}
      </div>
      {overLimit && (
        <p className="mt-1 text-xs text-warn">
          {r.overLimit(tags.length, platform.label, rule.hardLimit ?? 0, copyTags.length)}
        </p>
      )}

      <PackagingCheck text={text} tags={tags} platformId={platformId} trendTitles={trendTitles} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CopyButton text={text} label={r.copyCaption} />
        <CopyButton text={copyTags.join(" ")} label={r.copyHashtags} />
        <CopyButton text={captionWithHashtags(text, copyTags)} label={r.copyFor(platform.label)} variant="primary" />
        <Button size="sm" variant="ghost" onClick={() => setEditing((e) => !e)}>
          {!editing && <Pencil aria-hidden className="h-3.5 w-3.5" />}
          {editing ? d.common.doneEditing : d.common.edit}
        </Button>
        <Button size="sm" variant="secondary" onClick={save} disabled={saveState === "saving"}>
          {saveState === "saving" ? d.common.saving : saveState === "saved" ? `${d.common.saved} ✓` : d.common.save}
        </Button>
        {saveState === "error" && <span role="alert" className="text-xs text-danger">{r.saveFailed}</span>}
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {r.copyNote(platform.label, copyTags.length)}{" "}
        {rule.status === "official" ? r.ruleOfficial : rule.status === "unverified" ? r.ruleUnverified : r.ruleNone}
      </p>
    </div>
  );
}

function HashtagSection({ result, statuses, platformId }: { result: CaptionResult; statuses: ClientHashtagStatus[]; platformId: string }) {
  const verified = statuses.filter((s) => s.status === "verified");
  const searching = statuses.filter((s) => s.status === "search_interest");
  const demo = statuses.filter((s) => s.status === "demo");
  const verifiedTags = new Set([...verified, ...searching, ...demo].map((s) => s.tag.toLowerCase()));
  const suggested = result.hashtagSuggestions.filter((h) => !verifiedTags.has(h.tag.toLowerCase()));
  const platform = getPlatform(platformId);
  const { d } = useI18n();

  return (
    <Section title={d.result.hashtags}>
      {suggested.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-muted">{d.result.notVerified}</p>
          <ul className="space-y-1">
            {suggested.map((h) => (
              <li key={h.tag} className="flex flex-wrap items-baseline gap-2 text-sm">
                <Badge>{h.tag}</Badge>
                <span className="text-xs text-muted">{h.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {verified.length > 0 && (
        <EvidenceList title={d.result.observedIn(platform.family === "youtube" ? "YouTube" : platform.label)} tone="ok" items={verified} />
      )}
      {searching.length > 0 && <EvidenceList title={d.result.searchInterestTitle} tone="info" items={searching} />}
      {demo.length > 0 && <EvidenceList title={d.result.demoExamples} tone="accent" items={demo} />}
      <p className="mt-2 text-[11px] text-muted">{d.sports.labelsExplain}</p>
    </Section>
  );
}

function EvidenceList({ title, tone, items }: { title: string; tone: "ok" | "accent" | "info"; items: ClientHashtagStatus[] }) {
  const { lang, d } = useI18n();
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold">{title}</p>
      <ul className="space-y-2">
        {items.map((s) => (
          <li key={s.tag} className="rounded-lg border border-line p-2 text-xs">
            <Badge tone={tone}>{s.tag}</Badge>
            {s.evidence.map((e, i) => (
              <p key={i} className="mt-1 text-muted">
                {e.sourceName} · {e.platform} · {e.geo} · {d.result.observed} {formatDateTime(e.observedAt, lang)} · {d.result.retrieved} {formatDateTime(e.retrievedAt, lang)}
                <br />
                {d.result.coverage} {e.coverageNote}
                {e.url && (
                  <>
                    {" "}
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="underline">
                      {d.common.source}
                    </a>
                  </>
                )}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrendContextSection({ items }: { items: ClientMessage["contextUsed"] }) {
  const { lang, d } = useI18n();
  if (items === null) return null;
  return (
    <Section title={d.result.trendContext}>
      {items.length === 0 ? (
        <p className="text-xs text-muted">{d.result.trendNone}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.title} className="rounded-lg border border-line p-2 text-xs">
              <span className="font-semibold">{i.title}</span>
              {i.isDemo && <Badge tone="accent" className="ml-1">{d.result.tagDemo}</Badge>}
              <span className="block text-muted">
                {i.sourceName} · {i.geo} · {d.result.observed} {formatDateTime(i.observedAt, lang)}
                {i.metric ? ` · ${i.metric}` : ""}
              </span>
              <span className="block text-muted">{d.result.trendLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Honest packaging checks for one option. These are checks, not a prediction of performance. */
function PackagingCheck({ text, tags, platformId, trendTitles }: { text: string; tags: string[]; platformId: string; trendTitles: string[] }) {
  const { d } = useI18n();
  const r = d.result;
  const platform = getPlatform(platformId);
  const rule = platform.hashtagRule;
  // The opening is the first sentence of the first line (captions are often one long line).
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const opening = firstLine.match(/^.+?[.!?।…](\s|$)/u)?.[0] ?? firstLine;
  const firstWords = opening.trim().split(/\s+/).filter(Boolean).length;
  const lowered = text.toLowerCase();
  const trendHit = trendTitles.find((t) => lowered.includes(t.toLowerCase()));
  const limit = rule.hardLimit;
  const checks: { ok: boolean | null; label: string }[] = [
    { ok: firstWords <= 12, label: `${r.openingSentence(firstWords)}${firstWords <= 12 ? "" : r.openingLong}` },
    {
      ok: limit === null ? null : tags.length <= limit,
      label: r.hashtagCount(tags.length, limit, platform.label, rule.status === "unverified"),
    },
    { ok: trendHit ? true : null, label: trendHit ? r.mentionsTopic(trendHit) : r.noTopic },
  ];
  return (
    <div className="mt-2 rounded-lg bg-surface-2 p-2 text-[11px]">
      <p className="font-semibold text-muted">{r.packaging}</p>
      <ul className="mt-1 space-y-0.5">
        {checks.map((c) => (
          <li key={c.label} className={cx("flex items-center gap-1", c.ok === false ? "text-warn" : c.ok ? "text-ok" : "text-muted")}>
            {c.ok === false ? (
              <CircleAlert aria-hidden className="h-3 w-3 shrink-0" />
            ) : c.ok ? (
              <Check aria-hidden className="h-3 w-3 shrink-0" />
            ) : (
              <Dot aria-hidden className="h-3 w-3 shrink-0" />
            )}
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The recommended option adapted for each extra platform the creator picked. */
function PlatformVersions({ versions }: { versions: CaptionResult["platformVersions"] }) {
  const { d } = useI18n();
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{d.sports.versions}</p>
      {versions.map((v) => {
        const platform = getPlatform(v.platform);
        return (
          <div key={v.platform} className="rounded-lg border border-line p-3">
            <Badge tone="brand">{platform.label}</Badge>
            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">{v.caption}</p>
            {v.hashtags.length > 0 && <p className="mt-1 text-xs text-muted">{v.hashtags.join(" ")}</p>}
            <div className="mt-2">
              <CopyButton text={captionWithHashtags(v.caption, v.hashtags)} label={d.result.copyFor(platform.label)} variant="primary" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
