"use client";

import { useActionState } from "react";
import { createBriefAction, type BriefFormState } from "@/app/actions/work";
import { LANGUAGES, TONES } from "@/lib/domain/options";
import { PLATFORMS } from "@/lib/domain/platforms";
import { Button, Card, Field, Input, Notice, Select, Textarea } from "@/components/ui";

export function BriefForm({
  defaults,
}: {
  defaults: { topic: string; opportunityId: string; angle: string; platform: string; language: string; tone: string; personalExample: string };
}) {
  const [state, action, pending] = useActionState<BriefFormState, FormData>(createBriefAction, {});
  return (
    <Card className="p-5">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="opportunityId" value={defaults.opportunityId} />
        <Field label="Topic" htmlFor="topic">
          <Input id="topic" name="topic" required minLength={3} maxLength={500} defaultValue={defaults.topic} placeholder="e.g. Hostel ki pehli raat" />
        </Field>
        <Field label="Angle (optional)" htmlFor="angle" hint="Leave empty and the brief will propose one.">
          <Input id="angle" name="angle" maxLength={300} defaultValue={defaults.angle} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Platform" htmlFor="platform">
            <Select id="platform" name="platform" defaultValue={defaults.platform}>
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Language" htmlFor="language">
            <Select id="language" name="language" defaultValue={defaults.language}>
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tone" htmlFor="tone">
            <Select id="tone" name="tone" defaultValue={defaults.tone}>
              {TONES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Time you have for this video (minutes, optional)" htmlFor="availableMinutes">
          <Input id="availableMinutes" name="availableMinutes" type="number" min={10} max={2400} className="max-w-40" />
        </Field>
        <Field label="A personal example to use (optional)" htmlFor="personalExample" hint="Something you actually did or own — keeps the brief original to you.">
          <Textarea id="personalExample" name="personalExample" maxLength={600} defaultValue={defaults.personalExample} />
        </Field>
        {state.error && <Notice tone="danger">{state.error}</Notice>}
        <Button type="submit" disabled={pending}>
          {pending ? "Brief ban raha hai…" : "Generate brief"}
        </Button>
      </form>
    </Card>
  );
}
