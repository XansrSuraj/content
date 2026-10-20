"use client";

import { useState } from "react";
import type { CaptionContext } from "@/lib/domain/captions";
import { GOALS, LANGUAGES, LENGTHS, REGIONS, TONES } from "@/lib/domain/options";
import { PLATFORMS, getPlatform } from "@/lib/domain/platforms";
import { Badge, Field, Input, Select } from "@/components/ui";

export function ContextPanel({
  context,
  onChange,
  hasConversation,
}: {
  context: CaptionContext;
  onChange: (c: CaptionContext) => void;
  hasConversation: boolean;
}) {
  const [termDraft, setTermDraft] = useState("");
  const set = <K extends keyof CaptionContext>(k: K, v: CaptionContext[K]) => onChange({ ...context, [k]: v });
  const rule = getPlatform(context.platform).hashtagRule;

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-xs text-muted">
        Sensible defaults are set. {hasConversation ? "Changes apply to your next message." : "Change anything before sending, or just send."}
      </p>

      <Field label="Platform" htmlFor="ctx-platform">
        <Select id="ctx-platform" value={context.platform} onChange={(e) => set("platform", e.target.value as CaptionContext["platform"])}>
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <p className="-mt-2 text-xs text-muted">
        Hashtags: {rule.hardLimitNote}{" "}
        {rule.status === "unverified" && <Badge tone="warn">rule not officially confirmed</Badge>}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Language" htmlFor="ctx-lang">
          <Select id="ctx-lang" value={context.language} onChange={(e) => set("language", e.target.value as CaptionContext["language"])}>
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tone" htmlFor="ctx-tone">
          <Select id="ctx-tone" value={context.tone} onChange={(e) => set("tone", e.target.value as CaptionContext["tone"])}>
            {TONES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Goal" htmlFor="ctx-goal">
          <Select id="ctx-goal" value={context.goal} onChange={(e) => set("goal", e.target.value as CaptionContext["goal"])}>
            {GOALS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Length" htmlFor="ctx-length">
          <Select id="ctx-length" value={context.length} onChange={(e) => set("length", e.target.value as CaptionContext["length"])}>
            {LENGTHS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Region" htmlFor="ctx-region">
          <Select id="ctx-region" value={context.region} onChange={(e) => set("region", e.target.value)}>
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Emoji" htmlFor="ctx-emoji">
          <Select id="ctx-emoji" value={context.emoji} onChange={(e) => set("emoji", e.target.value as CaptionContext["emoji"])}>
            <option value="auto">Auto</option>
            <option value="light">Light</option>
            <option value="none">None</option>
          </Select>
        </Field>
      </div>

      <Field label="Audience" htmlFor="ctx-audience" hint="e.g. college students in Delhi, first-time phone buyers">
        <Input id="ctx-audience" value={context.audience} maxLength={200} onChange={(e) => set("audience", e.target.value)} />
      </Field>

      <Field label="Words / facts / brand names to keep exactly" htmlFor="ctx-term">
        <div className="flex gap-2">
          <Input
            id="ctx-term"
            value={termDraft}
            maxLength={60}
            onChange={(e) => setTermDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const v = termDraft.trim();
                if (v && !context.preserveTerms.includes(v) && context.preserveTerms.length < 10) set("preserveTerms", [...context.preserveTerms, v]);
                setTermDraft("");
              }
            }}
            placeholder="Type and press Enter"
          />
        </div>
      </Field>
      {context.preserveTerms.length > 0 && (
        <div className="-mt-2 flex flex-wrap gap-1">
          {context.preserveTerms.map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => set("preserveTerms", context.preserveTerms.filter((x) => x !== term))}
              className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand-ink"
              aria-label={`Remove ${term}`}
            >
              {term} ×
            </button>
          ))}
        </div>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={context.useTrends}
          onChange={(e) => set("useTrends", e.target.checked)}
        />
        <span>
          Use current trends as context
          <span className="block text-xs text-muted">
            Matches your topic with fresh Google Trends / Wikipedia data (search interest, not social virality) and shows what was used.
          </span>
        </span>
      </label>

      <Field label="Output" htmlFor="ctx-output">
        <Select id="ctx-output" value={context.outputMode} onChange={(e) => set("outputMode", e.target.value as CaptionContext["outputMode"])}>
          <option value="full">Full (options, hooks, explanation)</option>
          <option value="final_only">Only final caption + hashtags</option>
        </Select>
      </Field>

      {(context.keepFirstLine || context.notes.length > 0) && (
        <div>
          <p className="text-sm font-semibold">Active constraints</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {context.keepFirstLine && (
              <button type="button" onClick={() => set("keepFirstLine", null)} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs" title={context.keepFirstLine}>
                First line locked ×
              </button>
            )}
            {context.notes.map((n) => (
              <button key={n} type="button" onClick={() => set("notes", context.notes.filter((x) => x !== n))} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs">
                {n} ×
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
