"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { createBriefAction, type BriefFormState } from "@/app/actions/work";
import { LANGUAGES, TONES } from "@/lib/domain/options";
import { PLATFORMS } from "@/lib/domain/platforms";
import { useI18n } from "@/components/i18n-provider";
import { Button, Card, Field, Input, Notice, Select, Textarea } from "@/components/ui";

export function BriefForm({
  defaults,
}: {
  defaults: { topic: string; opportunityId: string; angle: string; platform: string; language: string; tone: string; personalExample: string };
}) {
  const { d } = useI18n();
  const t = d.briefs;
  const [state, action, pending] = useActionState<BriefFormState, FormData>(createBriefAction, {});
  return (
    <Card className="p-5 shadow-sm sm:p-6">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="opportunityId" value={defaults.opportunityId} />
        <Field label={t.topic} htmlFor="topic">
          <Input id="topic" name="topic" required minLength={3} maxLength={500} defaultValue={defaults.topic} placeholder={t.topicPlaceholder} />
        </Field>
        <Field label={`${t.angle} (${d.common.optional})`} htmlFor="angle" hint={t.angleHint}>
          <Input id="angle" name="angle" maxLength={300} defaultValue={defaults.angle} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t.platform} htmlFor="platform">
            <Select id="platform" name="platform" defaultValue={defaults.platform}>
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.language} htmlFor="language">
            <Select id="language" name="language" defaultValue={defaults.language}>
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {d.options.contentLanguages[l.id] ?? l.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.tone} htmlFor="tone">
            <Select id="tone" name="tone" defaultValue={defaults.tone}>
              {TONES.map((tn) => (
                <option key={tn.id} value={tn.id}>
                  {d.options.tones[tn.id] ?? tn.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={`${t.minutes} (${d.common.optional})`} htmlFor="availableMinutes">
          <Input id="availableMinutes" name="availableMinutes" type="number" min={10} max={2400} className="max-w-40" />
        </Field>
        <Field label={`${t.example} (${d.common.optional})`} htmlFor="personalExample" hint={t.exampleHint}>
          <Textarea id="personalExample" name="personalExample" maxLength={600} defaultValue={defaults.personalExample} />
        </Field>
        {state.error && <Notice tone="danger">{state.error}</Notice>}
        <Button type="submit" disabled={pending}>
          <Sparkles aria-hidden className="h-4 w-4" />
          {pending ? t.generating : t.generate}
        </Button>
      </form>
    </Card>
  );
}
