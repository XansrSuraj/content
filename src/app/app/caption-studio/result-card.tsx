"use client";

import { useState } from "react";
import { captionWithHashtags, type CaptionResult } from "@/lib/domain/captions";
import { NOT_VERIFIED_NOTICE, dedupeHashtags, hashtagsForCopy } from "@/lib/domain/hashtags";
import { getPlatform } from "@/lib/domain/platforms";
import type { ClientHashtagStatus, ClientMessage } from "@/lib/services/serialize";
import { CopyButton } from "@/components/copy-button";
import { Badge, Button, Card, Textarea, cx, formatDateTime } from "@/components/ui";

const MODE_LABEL = {
  live_ai: { tone: "ok" as const, text: "Live AI" },
  open_model: { tone: "ok" as const, text: "Open-source AI" },
  local_ai: { tone: "info" as const, text: "Local AI (development)" },
  template_preview: { tone: "warn" as const, text: "Template preview — not AI" },
  example: { tone: "accent" as const, text: "Example (pre-written, not generated from your input)" },
};

export function ResultCard({
  message,
  result,
  conversationId,
  platformId,
  outputMode,
}: {
  message: ClientMessage;
  result: CaptionResult;
  conversationId: string;
  platformId: string;
  outputMode: "full" | "final_only";
}) {
  const platform = getPlatform(platformId);
  const mode = message.mode ? MODE_LABEL[message.mode] : null;
  const [showAll, setShowAll] = useState(outputMode === "full");
  const recommended = result.variants.find((v) => v.id === result.recommendedVariantId) ?? result.variants[0];
  const ordered = [recommended, ...result.variants.filter((v) => v.id !== recommended.id)];
  const statusByTag = new Map(message.hashtags.map((h) => [h.tag.toLowerCase(), h]));

  return (
    <Card className="max-w-3xl overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-4 py-2">
        {mode && <Badge tone={mode.tone}>{mode.text}</Badge>}
        <span className="text-xs text-muted">For {platform.label}</span>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Samjha</p>
          <p className="text-sm">{result.topicSummary}</p>
        </div>

        {(result.assumptions.length > 0 || result.clarifyingQuestion) && outputMode === "full" && (
          <div className="rounded-lg bg-info-soft p-3 text-sm">
            {result.assumptions.map((a) => (
              <p key={a}>
                <span className="font-semibold">Assumption:</span> {a}
              </p>
            ))}
            {result.clarifyingQuestion && (
              <p className="mt-1">
                <span className="font-semibold">Question:</span> {result.clarifyingQuestion}
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
          {!showAll && (
            <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
              Show the other 2 options
            </Button>
          )}
        </div>

        {outputMode === "full" && (
          <>
            {result.hooks.length > 0 && (
              <Section title="Opening hook alternatives">
                <ul className="space-y-1">
                  {result.hooks.map((h) => (
                    <li key={h} className="flex items-start justify-between gap-2 text-sm">
                      <span>{h}</span>
                      <CopyButton text={h} label="Copy" />
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <TrendContextSection items={message.contextUsed} />

            <HashtagSection result={result} statuses={message.hashtags} platformId={platformId} />

            {result.keywords.length > 0 && (
              <Section title="Search phrases viewers might use">
                <div className="flex flex-wrap gap-1">
                  {result.keywords.map((k) => (
                    <Badge key={k}>{k}</Badge>
                  ))}
                </div>
              </Section>
            )}

            {result.improvements.length > 0 && (
              <Section title="What changed">
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
  const tone = status?.status === "verified" ? "ok" : status?.status === "demo" ? "accent" : "neutral";
  const label = status?.status === "verified" ? "observed" : status?.status === "demo" ? "demo" : null;
  return (
    <Badge tone={tone} title={label ? `${label} evidence available` : "Suggestion — trend status not verified"}>
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
        <span className="text-sm font-bold">Option {variant.id}</span>
        <Badge tone="brand">{variant.approach}</Badge>
        {recommended && <Badge tone="ok">Recommended</Badge>}
      </div>
      {reason && <p className="mb-2 text-xs text-muted">Why: {reason}</p>}

      {editing ? (
        <div className="space-y-2">
          <label className="sr-only" htmlFor={`edit-${messageId}-${variant.id}`}>
            Edit caption
          </label>
          <Textarea id={`edit-${messageId}-${variant.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={2200} />
          <label className="text-xs font-semibold" htmlFor={`tags-${messageId}-${variant.id}`}>
            Hashtags (space separated)
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
          {tags.length} hashtags is above the configured {platform.label} limit of {rule.hardLimit}. Copy uses the first {copyTags.length}.
        </p>
      )}

      <PackagingCheck text={text} tags={tags} platformId={platformId} trendTitles={trendTitles} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CopyButton text={text} label="Copy caption" />
        <CopyButton text={copyTags.join(" ")} label="Copy hashtags" />
        <CopyButton text={captionWithHashtags(text, copyTags)} label={`Copy for ${platform.label}`} variant="primary" />
        <Button size="sm" variant="ghost" onClick={() => setEditing((e) => !e)}>
          {editing ? "Done editing" : "Edit"}
        </Button>
        <Button size="sm" variant="secondary" onClick={save} disabled={saveState === "saving"}>
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : "Save"}
        </Button>
        {saveState === "error" && <span role="alert" className="text-xs text-danger">Save failed. Try again.</span>}
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Copy for {platform.label} includes up to {copyTags.length} hashtag{copyTags.length === 1 ? "" : "s"} (TrendSaathi default). {rule.status === "official" ? "Platform rule from official help." : rule.status === "unverified" ? "Platform limit not officially confirmed." : "No official limit found."}
      </p>
    </div>
  );
}

function HashtagSection({ result, statuses, platformId }: { result: CaptionResult; statuses: ClientHashtagStatus[]; platformId: string }) {
  const verified = statuses.filter((s) => s.status === "verified");
  const demo = statuses.filter((s) => s.status === "demo");
  const verifiedTags = new Set([...verified, ...demo].map((s) => s.tag.toLowerCase()));
  const suggested = result.hashtagSuggestions.filter((h) => !verifiedTags.has(h.tag.toLowerCase()));
  const platform = getPlatform(platformId);

  return (
    <Section title="Hashtags">
      {suggested.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-muted">{NOT_VERIFIED_NOTICE}</p>
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
        <EvidenceList title={`Observed in a ${platform.family === "youtube" ? "YouTube" : platform.label} source sample`} tone="ok" items={verified} />
      )}
      {demo.length > 0 && <EvidenceList title="Demo examples — sample data, not real trend evidence" tone="accent" items={demo} />}
    </Section>
  );
}

function EvidenceList({ title, tone, items }: { title: string; tone: "ok" | "accent"; items: ClientHashtagStatus[] }) {
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold">{title}</p>
      <ul className="space-y-2">
        {items.map((s) => (
          <li key={s.tag} className="rounded-lg border border-line p-2 text-xs">
            <Badge tone={tone}>{s.tag}</Badge>
            {s.evidence.map((e, i) => (
              <p key={i} className="mt-1 text-muted">
                {e.sourceName} · {e.platform} · {e.geo} · observed {formatDateTime(e.observedAt)} · retrieved {formatDateTime(e.retrievedAt)}
                <br />
                Coverage: {e.coverageNote}
                {e.url && (
                  <>
                    {" "}
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="underline">
                      Source
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
  if (items === null) return null;
  return (
    <Section title="Trend context used">
      {items.length === 0 ? (
        <p className="text-xs text-muted">
          No matching topic in current Google Trends / Wikipedia data, so these captions are based on your text only.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.title} className="rounded-lg border border-line p-2 text-xs">
              <span className="font-semibold">{i.title}</span>
              {i.isDemo && <Badge tone="accent" className="ml-1">demo</Badge>}
              <span className="block text-muted">
                {i.sourceName} · {i.geo} · observed {formatDateTime(i.observedAt)}
                {i.metric ? ` · ${i.metric}` : ""}
              </span>
              <span className="block text-muted">Search/reading interest — not social-media virality.</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Honest packaging checks for one option. These are checks, not a prediction of performance. */
function PackagingCheck({ text, tags, platformId, trendTitles }: { text: string; tags: string[]; platformId: string; trendTitles: string[] }) {
  const platform = getPlatform(platformId);
  const rule = platform.hashtagRule;
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const firstWords = firstLine.trim().split(/\s+/).filter(Boolean).length;
  const lowered = text.toLowerCase();
  const trendHit = trendTitles.find((t) => lowered.includes(t.toLowerCase()));
  const limit = rule.hardLimit;
  const checks: { ok: boolean | null; label: string }[] = [
    { ok: firstWords <= 12, label: `Opening line: ${firstWords} words${firstWords <= 12 ? "" : " (long — viewers may scroll past)"}` },
    {
      ok: limit === null ? null : tags.length <= limit,
      label: limit === null ? `${tags.length} hashtags (no official ${platform.label} limit found)` : `${tags.length} of max ${limit} hashtags${rule.status === "unverified" ? " (limit not officially confirmed)" : ""}`,
    },
    { ok: trendHit ? true : null, label: trendHit ? `Mentions a current search topic: “${trendHit}”` : "No current search topic mentioned" },
  ];
  return (
    <div className="mt-2 rounded-lg bg-surface-2 p-2 text-[11px]">
      <p className="font-semibold text-muted">Packaging check — not a prediction (no tool can predict virality)</p>
      <ul className="mt-1 space-y-0.5">
        {checks.map((c) => (
          <li key={c.label} className={c.ok === false ? "text-warn" : c.ok ? "text-ok" : "text-muted"}>
            {c.ok === false ? "!" : c.ok ? "✓" : "·"} {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
