"use client";

import { useActionState, useEffect, useRef } from "react";
import { addPublishedAction, type PublishedState } from "@/app/actions/work";
import { PLATFORMS } from "@/lib/domain/platforms";
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
  const [state, action, pending] = useActionState<PublishedState, FormData>(addPublishedAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Platform" htmlFor="p-platform">
        <Select id="p-platform" name="platform" defaultValue="instagram_reels">
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </Select>
      </Field>
      <Field label="Published on" htmlFor="p-date">
        <Input id="p-date" name="publishedAt" type="datetime-local" defaultValue={today} required />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Post link" htmlFor="p-url" hint="We store the link only. TrendSaathi does not fetch or read your post.">
          <Input id="p-url" name="url" type="url" required placeholder="https://www.instagram.com/reel/…" maxLength={500} />
        </Field>
      </div>
      <Field label="Caption used (optional)" htmlFor="p-variant">
        <Select id="p-variant" name="variantId" defaultValue="">
          <option value="">—</option>
          {variants.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </Select>
      </Field>
      <Field label="Brief used (optional)" htmlFor="p-brief">
        <Select id="p-brief" name="briefId" defaultValue="">
          <option value="">—</option>
          {briefs.map((b) => (
            <option key={b.id} value={b.id}>{b.topic}</option>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Notes (optional)" htmlFor="p-notes">
          <Textarea id="p-notes" name="notes" maxLength={1000} className="min-h-16" />
        </Field>
      </div>
      {state.error && <Notice tone="danger" className="sm:col-span-2">{state.error}</Notice>}
      {state.ok && <Notice tone="ok" className="sm:col-span-2">Link saved.</Notice>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add published post"}</Button>
      </div>
    </form>
  );
}
