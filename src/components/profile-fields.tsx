import { CATEGORIES, LANGUAGES, REGIONS, TONES } from "@/lib/domain/options";
import { PLATFORMS } from "@/lib/domain/platforms";
import type { Profile } from "@/lib/repo/creator";
import { Field, Input, Select, Textarea } from "./ui";

function Chip({ name, value, label, checked, note }: { name: string; value: string; label: string; checked: boolean; note?: string }) {
  return (
    <label className="cursor-pointer">
      <input type="checkbox" name={name} value={value} defaultChecked={checked} className="peer sr-only" />
      <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3 py-1.5 text-sm peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:text-brand-ink peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--focus)]">
        {label}
        {note && <span className="text-[10px] font-semibold uppercase text-muted">{note}</span>}
      </span>
    </label>
  );
}

/** Shared preference fields for onboarding and settings (server-rendered, plain form controls). */
export function ProfileFields({ profile }: { profile: Profile | null }) {
  const p = profile;
  return (
    <div className="flex flex-col gap-6">
      <Field label="Aapka naam / channel name" htmlFor="displayName">
        <Input id="displayName" name="displayName" defaultValue={p?.displayName ?? ""} maxLength={80} />
      </Field>

      <fieldset>
        <legend className="text-sm font-semibold">Aap kis type ka content banate ho?</legend>
        <p className="mb-2 text-xs text-muted">Up to 6. Niches marked “early” have less tuned sample content so far.</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip key={c.id} name="categories" value={c.id} label={c.hinglish} checked={p?.categories.includes(c.id) ?? false} note={c.focus ? undefined : "early"} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold">Kahan post karte ho?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {PLATFORMS.map((pl) => (
            <Chip key={pl.id} name="platforms" value={pl.id} label={pl.label} checked={p?.platforms.includes(pl.id) ?? false} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold">Content language</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <Chip key={l.id} name="contentLanguages" value={l.id} label={l.label} checked={(p?.contentLanguages ?? ["hinglish"]).includes(l.id)} />
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Audience region" htmlFor="region">
          <Select id="region" name="region" defaultValue={p?.region ?? "IN"}>
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Usual tone" htmlFor="defaultTone">
          <Select id="defaultTone" name="defaultTone" defaultValue={p?.defaultTone ?? "conversational"}>
            {TONES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="App language" htmlFor="uiLanguage">
          <Select id="uiLanguage" name="uiLanguage" defaultValue={p?.uiLanguage ?? "hinglish"}>
            <option value="hinglish">Hinglish</option>
            <option value="english">English</option>
          </Select>
        </Field>
      </div>

      <Field label="Aapka style (optional)" htmlFor="styleNotes" hint="e.g. “Short sentences, desi humour, no heavy English words.” Used to personalise captions and briefs.">
        <Textarea id="styleNotes" name="styleNotes" defaultValue={p?.styleNotes ?? ""} maxLength={600} />
      </Field>
      <Field label="Personal examples (optional)" htmlFor="personalExamples" hint="Real things you've done or own, so briefs can use them instead of generic scripts.">
        <Textarea id="personalExamples" name="personalExamples" defaultValue={p?.personalExamples ?? ""} maxLength={1000} />
      </Field>
      <Field label="Hours per week for content (optional)" htmlFor="weeklyTimeHours">
        <Input id="weeklyTimeHours" name="weeklyTimeHours" type="number" min={0} max={100} defaultValue={p?.weeklyTimeHours ?? ""} className="max-w-32" />
      </Field>
    </div>
  );
}
