import { CATEGORIES, LANGUAGES, REGIONS, TONES } from "@/lib/domain/options";
import { PLATFORMS } from "@/lib/domain/platforms";
import { LANGS, getDict, type Dict, type Lang } from "@/lib/i18n";
import type { Profile } from "@/lib/repo/creator";
import { TEAMS } from "@/lib/domain/sports/entities";
import { TIMEZONES } from "@/lib/domain/sports/timezones";
import { Field, Input, Select, Textarea } from "./ui";

const TEAM_GROUPS = [
  { key: "cricket-national", teams: TEAMS.filter((t) => t.sport === "cricket" && t.kind === "national") },
  { key: "ipl", teams: TEAMS.filter((t) => t.kind === "franchise") },
  { key: "football", teams: TEAMS.filter((t) => t.sport === "football") },
];

function Chip({ name, value, label, checked, note }: { name: string; value: string; label: string; checked: boolean; note?: string }) {
  return (
    <label className="cursor-pointer">
      <input type="checkbox" name={name} value={value} defaultChecked={checked} className="peer sr-only" />
      <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1.5 text-sm transition-colors hover:border-brand/60 peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:text-brand-ink peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--focus)]">
        {label}
        {note && <span className="text-[10px] font-semibold uppercase text-muted">{note}</span>}
      </span>
    </label>
  );
}

/** Shared preference fields for onboarding and settings (server-rendered, plain form controls). */
export function ProfileFields({ profile, d, defaultUiLanguage }: { profile: Profile | null; d: Dict; defaultUiLanguage?: Lang }) {
  const p = profile;
  const o = d.options;
  return (
    <div className="flex flex-col gap-6">
      <Field label={d.profile.name} htmlFor="displayName">
        <Input id="displayName" name="displayName" defaultValue={p?.displayName ?? ""} maxLength={80} />
      </Field>

      <fieldset>
        <legend className="text-sm font-semibold">{d.profile.categories}</legend>
        <p className="mb-2 text-xs text-muted">{d.profile.categoriesHint}</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              name="categories"
              value={c.id}
              label={o.categories[c.id] ?? c.label}
              checked={p?.categories.includes(c.id) ?? false}
              note={c.focus ? undefined : d.profile.early}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold">{d.profile.platforms}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {PLATFORMS.map((pl) => (
            <Chip key={pl.id} name="platforms" value={pl.id} label={pl.label} checked={p?.platforms.includes(pl.id) ?? false} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold">{d.profile.contentLanguages}</legend>
        <p className="mb-2 text-xs text-muted">{d.profile.contentLanguagesHint}</p>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <Chip key={l.id} name="contentLanguages" value={l.id} label={o.contentLanguages[l.id] ?? l.label} checked={(p?.contentLanguages ?? ["hinglish"]).includes(l.id)} />
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={d.profile.region} htmlFor="region">
          <Select id="region" name="region" defaultValue={p?.region ?? "IN"}>
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {o.regions[r.id] ?? r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={d.profile.tone} htmlFor="defaultTone">
          <Select id="defaultTone" name="defaultTone" defaultValue={p?.defaultTone ?? "conversational"}>
            {TONES.map((t) => (
              <option key={t.id} value={t.id}>
                {o.tones[t.id] ?? t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={d.profile.appLanguage} htmlFor="uiLanguage">
          <Select id="uiLanguage" name="uiLanguage" defaultValue={defaultUiLanguage ?? p?.uiLanguage ?? "hinglish"}>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {getDict(l).langName}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={`${d.profile.style} (${d.common.optional})`} htmlFor="styleNotes" hint={d.profile.styleHint}>
        <Textarea id="styleNotes" name="styleNotes" defaultValue={p?.styleNotes ?? ""} maxLength={600} />
      </Field>
      <Field label={`${d.profile.examples} (${d.common.optional})`} htmlFor="personalExamples" hint={d.profile.examplesHint}>
        <Textarea id="personalExamples" name="personalExamples" defaultValue={p?.personalExamples ?? ""} maxLength={1000} />
      </Field>
      <Field label={`${d.profile.hours} (${d.common.optional})`} htmlFor="weeklyTimeHours">
        <Input id="weeklyTimeHours" name="weeklyTimeHours" type="number" min={0} max={100} defaultValue={p?.weeklyTimeHours ?? ""} className="max-w-32" />
      </Field>

      <fieldset>
        <legend className="text-sm font-semibold">{d.sports.prefsTitle}</legend>
        <p className="text-xs text-muted">{d.sports.prefsHint}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["cricket", "football"] as const).map((s) => (
            <Chip key={s} name="sports" value={s} label={d.sports.sportNames[s]} checked={p?.sports?.sports.includes(s) ?? false} />
          ))}
        </div>
        <details className="mt-3" open={(p?.sports?.teamIds.length ?? 0) > 0}>
          <summary className="cursor-pointer text-sm font-semibold">{d.sports.favTeams}</summary>
          {TEAM_GROUPS.map((g) => (
            <div key={g.key} className="mt-2 flex flex-wrap gap-1.5">
              {g.teams.map((t) => (
                <Chip key={t.id} name="teamIds" value={t.id} label={t.name} checked={p?.sports?.teamIds.includes(t.id) ?? false} />
              ))}
            </div>
          ))}
        </details>
        <div className="mt-3 max-w-xs">
          <Field label={d.sports.timezone} htmlFor="timezone">
            <Select id="timezone" name="timezone" defaultValue={p?.sports?.timezone ?? "Asia/Kolkata"}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </fieldset>
    </div>
  );
}
