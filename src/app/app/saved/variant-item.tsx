"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { captionWithHashtags } from "@/lib/domain/captions";
import { dedupeHashtags, hashtagsForCopy } from "@/lib/domain/hashtags";
import { getPlatform } from "@/lib/domain/platforms";
import { CopyButton } from "@/components/copy-button";
import { Badge, Button, Card, Textarea } from "@/components/ui";

export function VariantItem({
  v,
}: {
  v: { id: string; label: string; platform: string; text: string; hashtags: string[]; edited: boolean; conversationId: string | null; date: string };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(v.text);
  const [tags, setTags] = useState(v.hashtags.join(" "));
  const [state, setState] = useState<"idle" | "saving" | "error" | "confirm">("idle");
  const platform = getPlatform(v.platform);
  const rule = platform.hashtagRule;
  const copyTags = hashtagsForCopy(dedupeHashtags(tags.split(/\s+/)), rule.copyDefault, rule.hardLimit);

  async function save() {
    setState("saving");
    const res = await fetch(`/api/variants/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, hashtags: tags.split(/\s+/).filter(Boolean) }),
    });
    if (!res.ok) return setState("error");
    setState("idle");
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    const res = await fetch(`/api/variants/${v.id}`, { method: "DELETE" });
    if (!res.ok) return setState("error");
    router.refresh();
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="brand">{platform.label}</Badge>
        <Badge>{v.label}</Badge>
        {v.edited && <Badge>Edited</Badge>}
        <span className="text-xs text-muted">{v.date}</span>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <label className="sr-only" htmlFor={`sv-${v.id}`}>Caption</label>
          <Textarea id={`sv-${v.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={2200} />
          <label className="sr-only" htmlFor={`st-${v.id}`}>Hashtags</label>
          <Textarea id={`st-${v.id}`} value={tags} onChange={(e) => setTags(e.target.value)} rows={2} className="min-h-0" />
        </div>
      ) : (
        <>
          <p className="mt-2 whitespace-pre-wrap text-sm">{text}</p>
          <p className="mt-1 text-xs text-muted">{tags}</p>
        </>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CopyButton text={text} label="Copy caption" />
        <CopyButton text={copyTags.join(" ")} label="Copy hashtags" />
        <CopyButton text={captionWithHashtags(text, copyTags)} label="Copy both" />
        {editing ? (
          <>
            <Button size="sm" onClick={save} disabled={state === "saving" || !text.trim()}>
              {state === "saving" ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setText(v.text); setTags(v.hashtags.join(" ")); }}>
              Cancel
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
        {state === "confirm" ? (
          <>
            <Button size="sm" variant="danger" onClick={remove}>Confirm delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setState("idle")}>Keep</Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => setState("confirm")}>
            Delete
          </Button>
        )}
        {state === "error" && <span role="alert" className="text-xs text-danger">That didn&apos;t work. Try again.</span>}
      </div>
    </Card>
  );
}
