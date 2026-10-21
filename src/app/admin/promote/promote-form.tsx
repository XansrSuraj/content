"use client";

import { useActionState } from "react";
import { promoteObservations, type PromoteState } from "@/app/actions/admin";
import { CATEGORIES, LANGUAGES, REGIONS } from "@/lib/domain/options";
import { PLATFORMS } from "@/lib/domain/platforms";
import { Button, Card, Field, Input, Notice, Select, Textarea } from "@/components/ui";

function Checks({ name, items, defaults = [] }: { name: string; items: { id: string; label: string }[]; defaults?: string[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((i) => (
        <label key={i.id} className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name={name} value={i.id} defaultChecked={defaults.includes(i.id)} />
          {i.label}
        </label>
      ))}
    </div>
  );
}

export function PromoteForm({ observationId, title }: { observationId: string | null; title: string }) {
  const [state, action, pending] = useActionState<PromoteState, FormData>(promoteObservations, {});
  return (
    <Card className="p-5">
      <form action={action} className="flex flex-col gap-4">
        {observationId && <input type="hidden" name="observationIds" value={observationId} />}
        <Field label="Title" htmlFor="title"><Input id="title" name="title" defaultValue={title} required maxLength={200} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Kind" htmlFor="kind">
            <Select id="kind" name="kind" defaultValue="topic">
              <option value="topic">Topic</option><option value="person">Person</option><option value="event">Event</option><option value="idea">Idea</option>
            </Select>
          </Field>
          <Field label="Group" htmlFor="group">
            <Select id="group" name="group" defaultValue={observationId ? "timely" : "evergreen"}>
              <option value="timely">Timely</option><option value="plan">Worth planning</option><option value="evergreen">Evergreen</option>
            </Select>
          </Field>
          <Field label="Production effort" htmlFor="effort">
            <Select id="effort" name="effort" defaultValue="low">
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </Select>
          </Field>
        </div>
        <fieldset><legend className="text-sm font-semibold">Categories</legend><Checks name="categories" items={CATEGORIES.filter((c) => c.available).map((c) => ({ id: c.id, label: c.hinglish }))} /></fieldset>
        <fieldset><legend className="text-sm font-semibold">Languages</legend><Checks name="languages" items={[...LANGUAGES]} defaults={["hinglish"]} /></fieldset>
        <fieldset><legend className="text-sm font-semibold">Regions</legend><Checks name="regions" items={[...REGIONS]} defaults={["IN"]} /></fieldset>
        <fieldset><legend className="text-sm font-semibold">Suits destinations</legend><Checks name="platforms" items={PLATFORMS.map((p) => ({ id: p.id, label: p.label }))} defaults={["instagram_reels", "youtube_shorts"]} /></fieldset>
        <Field label="Summary" htmlFor="summary"><Textarea id="summary" name="summary" required maxLength={600} /></Field>
        <Field label="Why it may fit creators" htmlFor="fitReason"><Textarea id="fitReason" name="fitReason" required maxLength={600} /></Field>
        <Field label="Original angles (one per line, “Title: description”)" htmlFor="angles"><Textarea id="angles" name="angles" rows={4} required /></Field>
        <Field label="Suggested hashtags (space separated, suggestions only)" htmlFor="hashtags"><Input id="hashtags" name="hashtags" /></Field>
        <Field label="Sensitivity / verification note (optional)" htmlFor="sensitivityNote"><Input id="sensitivityNote" name="sensitivityNote" maxLength={400} /></Field>
        {state.error && <Notice tone="danger">{state.error}</Notice>}
        <Button type="submit" disabled={pending}>{pending ? "Publishing…" : "Publish opportunity"}</Button>
      </form>
    </Card>
  );
}
