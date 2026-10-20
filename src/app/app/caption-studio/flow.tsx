"use client";

import { useState } from "react";
import { Check, ChevronDown, Pencil } from "lucide-react";
import type { CaptionContext } from "@/lib/domain/captions";
import type { SportsContextUsed } from "@/lib/db/schema";
import { LANGUAGES, REGIONS, TONES } from "@/lib/domain/options";
import { PLATFORMS, type PlatformId } from "@/lib/domain/platforms";
import { useI18n } from "@/components/i18n-provider";
import { Field, Input, Select, Textarea, cx } from "@/components/ui";

const MAX_PLATFORMS = 3;

/** Selected platforms in order: primary first, then the extra ones. */
export function selectedPlatforms(c: CaptionContext): PlatformId[] {
  return [c.platform, ...c.extraPlatforms.filter((p) => p !== c.platform)];
}

/** First turn: required platform multi-select and optional "More details". */
export function StartPanel({ context, onChange }: { context: CaptionContext; onChange: (c: CaptionContext) => void }) {
  const { d } = useI18n();
  const t = d.flow;
  const o = d.options;
  const chosen = selectedPlatforms(context);
  const setDetails = (k: keyof CaptionContext["details"], v: string) => onChange({ ...context, details: { ...context.details, [k]: v } });

  function toggle(id: PlatformId) {
    let next = chosen.includes(id) ? chosen.filter((p) => p !== id) : [...chosen, id].slice(0, MAX_PLATFORMS);
    if (next.length === 0) next = [id]; // at least one platform is required
    onChange({ ...context, platform: next[0], extraPlatforms: next.slice(1) });
  }

  return (
    <div className="mx-auto mt-6 max-w-2xl space-y-3 text-left">
      <fieldset>
        <legend className="text-sm font-semibold">
          {t.platformsLabel} <span className="text-danger">*</span>
        </legend>
        <p className="text-xs text-muted">{t.platformsHint}</p>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group">
          {PLATFORMS.map((p) => {
            const idx = chosen.indexOf(p.id);
            const on = idx >= 0;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                disabled={!on && chosen.length >= MAX_PLATFORMS}
                onClick={() => toggle(p.id)}
                className={cx(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-40",
                  on ? "border-brand bg-brand-soft text-brand-ink" : "border-line bg-surface hover:border-brand/60",
                )}
              >
                {on && <Check aria-hidden className="h-3.5 w-3.5" />}
                {p.label}
                {idx === 0 && chosen.length > 1 && <span className="text-[10px] font-semibold uppercase text-muted">1</span>}
              </button>
            );
          })}
        </div>
      </fieldset>

      <details className="rounded-xl border border-line bg-surface p-3">
        <summary className="flex cursor-pointer items-center gap-1 text-sm font-semibold">
          <ChevronDown aria-hidden className="h-4 w-4" />
          {t.moreDetails}
        </summary>
        <div className="mt-3 grid gap-3">
          <Field label={t.videoDescription} htmlFor="det-desc">
            <Input
              id="det-desc"
              maxLength={200}
              value={context.details.videoDescription}
              onChange={(e) => setDetails("videoDescription", e.target.value)}
            />
          </Field>
          <Field label={t.transcript} htmlFor="det-transcript">
            <Textarea
              id="det-transcript"
              maxLength={4000}
              rows={3}
              value={context.details.transcript}
              onChange={(e) => setDetails("transcript", e.target.value)}
            />
          </Field>
          <Field label={t.preferredTeam} htmlFor="det-team">
            <Input id="det-team" maxLength={80} value={context.details.preferredTeam} onChange={(e) => setDetails("preferredTeam", e.target.value)} />
          </Field>
          <Field label={t.reference} htmlFor="det-ref" hint={t.referenceHint}>
            <Input id="det-ref" maxLength={300} value={context.details.reference} onChange={(e) => setDetails("reference", e.target.value)} />
          </Field>
          <fieldset>
            <legend className="text-sm font-semibold">{d.sports.publish}</legend>
            <div className="mt-1 flex gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" name="det-publish" checked={!context.publishAt} onChange={() => onChange({ ...context, publishAt: null })} />
                {d.sports.publishNow}
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="det-publish"
                  checked={Boolean(context.publishAt)}
                  onChange={() => onChange({ ...context, publishAt: new Date(Date.now() + 3_600_000).toISOString() })}
                />
                {d.sports.publishLater}
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold">{t.overrides}</legend>
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              <Select
                aria-label={d.context.language}
                value={context.language}
                onChange={(e) => onChange({ ...context, language: e.target.value as CaptionContext["language"] })}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {o.contentLanguages[l.id] ?? l.label}
                  </option>
                ))}
              </Select>
              <Select
                aria-label={d.context.tone}
                value={context.tone}
                onChange={(e) => onChange({ ...context, tone: e.target.value as CaptionContext["tone"] })}
              >
                {TONES.map((x) => (
                  <option key={x.id} value={x.id}>
                    {o.tones[x.id] ?? x.label}
                  </option>
                ))}
              </Select>
              <Select aria-label={d.context.region} value={context.region} onChange={(e) => onChange({ ...context, region: e.target.value })}>
                {REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {o.regions[r.id] ?? r.label}
                  </option>
                ))}
              </Select>
            </div>
          </fieldset>
        </div>
      </details>
    </div>
  );
}

type Correction = Partial<Pick<CaptionContext, "sportOverride" | "intentOverride" | "language" | "matchId">>;

function ChipMenu({
  label,
  options,
  onPick,
}: {
  label: string;
  options: { value: string; label: string; active: boolean }[];
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((x) => !x)}
        className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold hover:border-brand focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
      >
        {label}
        <Pencil aria-hidden className="h-3 w-3 text-muted" />
      </button>
      {open && (
        <span
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 flex min-w-40 flex-col rounded-lg border border-line bg-surface p-1 shadow-md"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="menuitemradio"
              aria-checked={opt.active}
              onClick={() => {
                setOpen(false);
                if (!opt.active) onPick(opt.value);
              }}
              className={cx("rounded-md px-2 py-1.5 text-left text-xs hover:bg-surface-2", opt.active && "font-semibold text-brand")}
            >
              {opt.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/** "Football · Arsenal vs Chelsea · Match preview · Hinglish" — every part can be corrected. */
export function InterpretChip({
  sports,
  context,
  onCorrect,
  onMatch,
}: {
  sports: SportsContextUsed | null;
  context: CaptionContext;
  onCorrect: (c: Correction) => void;
  onMatch: () => void;
}) {
  const { d } = useI18n();
  const t = d.flow;
  const sport = context.sportOverride === "none" ? null : (sports?.sport ?? null);
  const intent = (context.intentOverride ?? sports?.contentType ?? "unknown") as string;
  const matchLabel = sports?.match
    ? `${sports.match.homeName} vs ${sports.match.awayName}`
    : sports?.teams.length
      ? sports.teams.join(" vs ")
      : t.noMatch;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-label={t.understoodAs}>
      <span className="font-semibold text-muted">{t.understoodAs}:</span>
      <ChipMenu
        label={sport ? d.sports.sportNames[sport] : t.general}
        options={[
          { value: "cricket", label: d.sports.sportNames.cricket, active: sport === "cricket" },
          { value: "football", label: d.sports.sportNames.football, active: sport === "football" },
          { value: "none", label: t.notSports, active: !sport },
        ]}
        onPick={(v) => onCorrect({ sportOverride: v as CaptionContext["sportOverride"], matchId: null })}
      />
      {sport && (
        <>
          <button
            type="button"
            onClick={onMatch}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold hover:border-brand"
          >
            {matchLabel}
            <Pencil aria-hidden className="h-3 w-3 text-muted" />
          </button>
          <ChipMenu
            label={t.intents[intent] ?? t.intents.unknown}
            options={(["preview", "prediction", "analysis", "reaction", "recap", "historical_highlight", "meme", "fan_opinion"] as const).map(
              (v) => ({
                value: v,
                label: t.intents[v],
                active: v === intent,
              }),
            )}
            onPick={(v) => onCorrect({ intentOverride: v as CaptionContext["intentOverride"] })}
          />
        </>
      )}
      <ChipMenu
        label={d.options.contentLanguages[context.language] ?? context.language}
        options={(["hinglish", "hindi", "english"] as const).map((v) => ({
          value: v,
          label: d.options.contentLanguages[v],
          active: v === context.language,
        }))}
        onPick={(v) => onCorrect({ language: v as CaptionContext["language"] })}
      />
      <span className="text-[11px] text-muted">{t.tapToCorrect}</span>
    </div>
  );
}
