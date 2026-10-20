"use client";

import { useState } from "react";
import type { CaptionContext } from "@/lib/domain/captions";
import { GOALS, LANGUAGES, LENGTHS, REGIONS, TONES } from "@/lib/domain/options";
import { PLATFORMS, getPlatform } from "@/lib/domain/platforms";
import { useI18n } from "@/components/i18n-provider";
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
  const { d } = useI18n();
  const t = d.context;
  const o = d.options;
  const [termDraft, setTermDraft] = useState("");
  const set = <K extends keyof CaptionContext>(k: K, v: CaptionContext[K]) => onChange({ ...context, [k]: v });
  const rule = getPlatform(context.platform).hashtagRule;

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-xs text-muted">
        {hasConversation ? t.defaultsFollow : t.defaults}
      </p>

      <Field label={t.platform} htmlFor="ctx-platform">
        <Select id="ctx-platform" value={context.platform} onChange={(e) => set("platform", e.target.value as CaptionContext["platform"])}>
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <p className="-mt-2 text-xs text-muted">
        {t.hashtagsNote} {rule.hardLimitNote}{" "}
        {rule.status === "unverified" && <Badge tone="warn">{t.ruleUnverified}</Badge>}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t.language} htmlFor="ctx-lang">
          <Select id="ctx-lang" value={context.language} onChange={(e) => set("language", e.target.value as CaptionContext["language"])}>
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {o.contentLanguages[l.id] ?? l.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.tone} htmlFor="ctx-tone">
          <Select id="ctx-tone" value={context.tone} onChange={(e) => set("tone", e.target.value as CaptionContext["tone"])}>
            {TONES.map((x) => (
              <option key={x.id} value={x.id}>
                {o.tones[x.id] ?? x.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.goal} htmlFor="ctx-goal">
          <Select id="ctx-goal" value={context.goal} onChange={(e) => set("goal", e.target.value as CaptionContext["goal"])}>
            {GOALS.map((g) => (
              <option key={g.id} value={g.id}>
                {o.goals[g.id] ?? g.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.length} htmlFor="ctx-length">
          <Select id="ctx-length" value={context.length} onChange={(e) => set("length", e.target.value as CaptionContext["length"])}>
            {LENGTHS.map((l) => (
              <option key={l.id} value={l.id}>
                {o.lengths[l.id] ?? l.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.region} htmlFor="ctx-region">
          <Select id="ctx-region" value={context.region} onChange={(e) => set("region", e.target.value)}>
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {o.regions[r.id] ?? r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.emoji} htmlFor="ctx-emoji">
          <Select id="ctx-emoji" value={context.emoji} onChange={(e) => set("emoji", e.target.value as CaptionContext["emoji"])}>
            {(["auto", "light", "none"] as const).map((k) => (
              <option key={k} value={k}>
                {o.emoji[k]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={t.audience} htmlFor="ctx-audience" hint={t.audienceHint}>
        <Input id="ctx-audience" value={context.audience} maxLength={200} onChange={(e) => set("audience", e.target.value)} />
      </Field>

      <Field label={t.keepExact} htmlFor="ctx-term">
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
            placeholder={t.keepPlaceholder}
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
              aria-label={t.removeTerm(term)}
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
          {t.useTrends}
          <span className="block text-xs text-muted">{t.useTrendsHint}</span>
        </span>
      </label>

      <Field label={t.output} htmlFor="ctx-output">
        <Select id="ctx-output" value={context.outputMode} onChange={(e) => set("outputMode", e.target.value as CaptionContext["outputMode"])}>
          <option value="full">{t.outputFull}</option>
          <option value="final_only">{t.outputFinal}</option>
        </Select>
      </Field>

      {(context.keepFirstLine || context.notes.length > 0) && (
        <div>
          <p className="text-sm font-semibold">{t.activeConstraints}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {context.keepFirstLine && (
              <button type="button" onClick={() => set("keepFirstLine", null)} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs" title={context.keepFirstLine}>
                {t.firstLineLocked} ×
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
