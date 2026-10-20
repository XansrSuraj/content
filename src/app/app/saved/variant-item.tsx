"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { captionWithHashtags } from "@/lib/domain/captions";
import { dedupeHashtags, hashtagsForCopy } from "@/lib/domain/hashtags";
import { getPlatform } from "@/lib/domain/platforms";
import { useI18n } from "@/components/i18n-provider";
import { CopyButton } from "@/components/copy-button";
import { Badge, Button, Card, Textarea } from "@/components/ui";

export function VariantItem({
  v,
}: {
  v: { id: string; label: string; platform: string; text: string; hashtags: string[]; edited: boolean; conversationId: string | null; date: string };
}) {
  const { d } = useI18n();
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
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="brand">{platform.label}</Badge>
        <Badge>{v.label}</Badge>
        {v.edited && <Badge>{d.briefs.edited}</Badge>}
        <span className="text-xs text-muted">{v.date}</span>
      </div>
      {editing ? (
        <div className="mt-3 space-y-2">
          <label className="sr-only" htmlFor={`sv-${v.id}`}>
            {d.saved.caption}
          </label>
          <Textarea id={`sv-${v.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={2200} />
          <label className="sr-only" htmlFor={`st-${v.id}`}>
            {d.saved.hashtags}
          </label>
          <Textarea id={`st-${v.id}`} value={tags} onChange={(e) => setTags(e.target.value)} rows={2} className="min-h-0" />
        </div>
      ) : (
        <>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
          <p className="mt-1 text-xs text-muted">{tags}</p>
        </>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <CopyButton text={text} label={d.result.copyCaption} />
        <CopyButton text={copyTags.join(" ")} label={d.result.copyHashtags} />
        <CopyButton text={captionWithHashtags(text, copyTags)} label={d.saved.copyBoth} />
        {editing ? (
          <>
            <Button size="sm" onClick={save} disabled={state === "saving" || !text.trim()}>
              {state === "saving" ? d.common.saving : d.common.save}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setText(v.text);
                setTags(v.hashtags.join(" "));
              }}
            >
              {d.common.cancel}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil aria-hidden className="h-3.5 w-3.5" />
            {d.common.edit}
          </Button>
        )}
        {state === "confirm" ? (
          <>
            <Button size="sm" variant="danger" onClick={remove}>
              {d.common.confirmDelete}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setState("idle")}>
              {d.common.keep}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => setState("confirm")}>
            <Trash2 aria-hidden className="h-3.5 w-3.5" />
            {d.common.delete}
          </Button>
        )}
        {state === "error" && (
          <span role="alert" className="text-xs text-danger">
            {d.saved.failed}
          </span>
        )}
      </div>
    </Card>
  );
}
