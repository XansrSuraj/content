"use client";

import { useActionState, useEffect, useRef } from "react";
import { addPublishedAction, type PublishedState } from "@/app/actions/work";
import { PLATFORMS } from "@/lib/domain/platforms";
import { useI18n } from "@/components/i18n-provider";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui";

export function AddPublishedForm({
  variants,
  briefs,
  today,
}: {
  variants: { id: string; label: string }[];
  briefs: { id: string; topic: string }[];
  today: string;
}) {
  const { d } = useI18n();
  const t = d.published;
  const [state, action, pending] = useActionState<PublishedState, FormData>(addPublishedAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label={t.platform} htmlFor="p-platform">
        <Select id="p-platform" name="platform" defaultValue="instagram_reels">
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t.publishedOn} htmlFor="p-date">
        <Input id="p-date" name="publishedAt" type="datetime-local" defaultValue={today} required />
      </Field>
      <div className="sm:col-span-2">
        <Field label={t.link} htmlFor="p-url" hint={t.linkHint}>
          <Input id="p-url" name="url" type="url" required placeholder="https://www.instagram.com/reel/…" maxLength={500} />
        </Field>
      </div>
      <Field label={`${t.captionUsed} (${d.common.optional})`} htmlFor="p-variant">
        <Select id="p-variant" name="variantId" defaultValue="">
          <option value="">—</option>
          {variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={`${t.briefUsed} (${d.common.optional})`} htmlFor="p-brief">
        <Select id="p-brief" name="briefId" defaultValue="">
          <option value="">—</option>
          {briefs.map((b) => (
            <option key={b.id} value={b.id}>
              {b.topic}
            </option>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label={`${t.notes} (${d.common.optional})`} htmlFor="p-notes">
          <Textarea id="p-notes" name="notes" maxLength={1000} className="min-h-16" />
        </Field>
      </div>
      {state.error && (
        <Notice tone="danger" className="sm:col-span-2">
          {state.error}
        </Notice>
      )}
      {state.ok && (
        <Notice tone="ok" className="sm:col-span-2">
          {t.added}
        </Notice>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? d.common.saving : t.add}
        </Button>
      </div>
    </form>
  );
}
