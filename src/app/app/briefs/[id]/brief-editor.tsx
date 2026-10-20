"use client";

import { useActionState } from "react";
import { updateBriefAction, type BriefFormState } from "@/app/actions/work";
import type { BriefContent } from "@/lib/domain/briefs";
import { useI18n } from "@/components/i18n-provider";
import { Button, Card, Field, Input, Notice, Textarea } from "@/components/ui";

export function BriefEditor({ briefId, content: c }: { briefId: string; content: BriefContent }) {
  const { d } = useI18n();
  const e = d.briefs.editor;
  const [state, action, pending] = useActionState<BriefFormState, FormData>(updateBriefAction.bind(null, briefId), {});
  return (
    <Card className="mt-6 p-5 sm:p-6">
      <form action={action} className="flex flex-col gap-4">
        <Field label={e.angle} htmlFor="originalAngle">
          <Textarea id="originalAngle" name="originalAngle" defaultValue={c.originalAngle} maxLength={600} required />
        </Field>
        <Field label={e.audience} htmlFor="intendedAudience">
          <Input id="intendedAudience" name="intendedAudience" defaultValue={c.intendedAudience} maxLength={400} />
        </Field>
        <Field label={e.hooks} htmlFor="hooks">
          <Textarea id="hooks" name="hooks" defaultValue={c.hooks.join("\n")} required />
        </Field>
        <Field label={e.openingShot} htmlFor="openingShot">
          <Textarea id="openingShot" name="openingShot" defaultValue={c.openingShot} maxLength={500} />
        </Field>
        <Field label={e.beats} htmlFor="beats">
          <Textarea id="beats" name="beats" defaultValue={c.beats.map((b) => `${b.beat}: ${b.detail}`).join("\n")} rows={6} required />
        </Field>
        <Field label={e.cta} htmlFor="callToAction">
          <Input id="callToAction" name="callToAction" defaultValue={c.callToAction} maxLength={300} />
        </Field>
        <Field label={e.titles} htmlFor="titleOptions">
          <Textarea id="titleOptions" name="titleOptions" defaultValue={c.titleOptions.join("\n")} />
        </Field>
        <Field label={e.hashtags} htmlFor="hashtags">
          <Input id="hashtags" name="hashtags" defaultValue={c.hashtags.join(" ")} />
        </Field>
        <Field label={e.facts} htmlFor="factsToVerify">
          <Textarea id="factsToVerify" name="factsToVerify" defaultValue={c.factsToVerify.join("\n")} />
        </Field>
        <Field label={e.lowEffort} htmlFor="lowEffortVersion">
          <Textarea id="lowEffortVersion" name="lowEffortVersion" defaultValue={c.lowEffortVersion} maxLength={800} />
        </Field>
        {state.error && <Notice tone="danger">{state.error}</Notice>}
        <Button type="submit" disabled={pending}>
          {pending ? d.common.saving : e.saveChanges}
        </Button>
      </form>
    </Card>
  );
}
