"use client";

import { useEffect, useState } from "react";
import { Link2, Plus, X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button, Input, Select } from "@/components/ui";

interface Ref {
  id: string;
  platform: string;
  topic: string;
  url: string | null;
}

const PLATFORMS = ["instagram", "youtube", "tiktok", "facebook", "reddit", "x", "other"] as const;
const LABEL: Record<string, string> = { instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", facebook: "Facebook", reddit: "Reddit", x: "X", other: "Other" };

/** Creator-provided references (a Reel, audio or trend they saw). Labelled as unverified wherever they are used. */
export function ReferencesBox() {
  const { d } = useI18n();
  const t = d.sports;
  const [refs, setRefs] = useState<Ref[]>([]);
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("instagram");
  const [topic, setTopic] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/references")
      .then((r) => (r.ok ? r.json() : { references: [] }))
      .then((j) => alive && setRefs(j.references ?? []))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function add() {
    if (topic.trim().length < 2) return;
    setBusy(true);
    setError(false);
    const res = await fetch("/api/references", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, topic: topic.trim(), url: url.trim() || null }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(true);
    const list = await fetch("/api/references").then((r) => r.json()).catch(() => ({ references: [] }));
    setRefs(list.references ?? []);
    setTopic("");
    setUrl("");
    setOpen(false);
  }

  async function remove(id: string) {
    const res = await fetch(`/api/references/${id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setRefs((r) => r.filter((x) => x.id !== id));
  }

  return (
    <div>
      <p className="text-sm font-semibold">{t.refAdd}</p>
      <p className="text-xs text-muted">{t.refAddHint}</p>
      {refs.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {refs.slice(0, 8).map((r) => (
            <li key={r.id} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs">
              <Link2 aria-hidden className="h-3 w-3" />
              <span className="max-w-40 truncate">
                {LABEL[r.platform] ?? r.platform}: {r.topic}
              </span>
              <button type="button" onClick={() => remove(r.id)} aria-label={t.refRemove(r.topic)} className="text-muted hover:text-danger">
                <X aria-hidden className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <div className="mt-2 space-y-2">
          <label className="sr-only" htmlFor="ref-platform">
            {t.refPlatform}
          </label>
          <Select id="ref-platform" value={platform} onChange={(e) => setPlatform(e.target.value as (typeof PLATFORMS)[number])}>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {LABEL[p]}
              </option>
            ))}
          </Select>
          <label className="sr-only" htmlFor="ref-topic">
            {t.refTopic}
          </label>
          <Input id="ref-topic" value={topic} maxLength={120} onChange={(e) => setTopic(e.target.value)} placeholder={t.refTopicPlaceholder} />
          <label className="sr-only" htmlFor="ref-url">
            {t.refUrl}
          </label>
          <Input id="ref-url" type="url" value={url} maxLength={500} onChange={(e) => setUrl(e.target.value)} placeholder={t.refUrl} />
          <div className="flex gap-2">
            <Button size="sm" onClick={add} disabled={busy || topic.trim().length < 2}>
              {t.refSave}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {d.common.cancel}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {t.refFailed}
            </p>
          )}
        </div>
      ) : (
        <Button size="sm" variant="secondary" className="mt-2" onClick={() => setOpen(true)}>
          <Plus aria-hidden className="h-3.5 w-3.5" />
          {t.refSave}
        </Button>
      )}
    </div>
  );
}
