"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Dict } from "@/lib/i18n/en";
import { useI18n } from "@/components/i18n-provider";
import { Badge, Button, LinkButton, cx } from "@/components/ui";

export interface ConvSummary {
  id: string;
  title: string;
  updatedAt: string;
  isExample: boolean;
}

function groupLabel(iso: string, now: Date, t: Dict["conversations"]): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const at = new Date(iso).getTime();
  if (at >= startOfToday) return t.today;
  if (at >= startOfToday - 86_400_000) return t.yesterday;
  if (at >= startOfToday - 7 * 86_400_000) return t.week;
  return t.older;
}

/** Chat-app style list: search, date groups, inline rename/delete (state updates instantly, no reload). */
export function ConversationList({
  items,
  activeId,
  onChange,
}: {
  items: ConvSummary[];
  activeId: string | null;
  onChange: (next: ConvSummary[]) => void;
}) {
  const { d } = useI18n();
  const t = d.conversations;
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = new Date();
    const filtered = [...items]
      .filter((c) => !q || c.title.toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const map = new Map<string, ConvSummary[]>();
    for (const c of filtered) {
      const g = groupLabel(c.updatedAt, now, t);
      map.set(g, [...(map.get(g) ?? []), c]);
    }
    return [...map.entries()];
  }, [items, query, t]);

  async function rename(id: string) {
    const next = title.trim();
    if (!next) return;
    setError(null);
    const res = await fetch(`/api/captions/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: next }),
    });
    if (!res.ok) return setError(t.renameFailed);
    setEditing(null);
    onChange(items.map((c) => (c.id === id ? { ...c, title: next } : c)));
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/captions/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) return setError(t.deleteFailed);
    setConfirmDelete(null);
    onChange(items.filter((c) => c.id !== id));
    if (id === activeId) router.push("/app/caption-studio?new=1");
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <LinkButton href="/app/caption-studio?new=1" size="sm" className="w-full">
        <Plus aria-hidden className="h-4 w-4" />
        {t.newCaption}
      </LinkButton>
      {items.length > 4 && (
        <>
          <label htmlFor="conv-search" className="sr-only">
            {t.searchLabel}
          </label>
          <input
            id="conv-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.search}
            className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-sm placeholder:text-muted/70"
          />
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {items.length === 0 && <p className="px-1 py-4 text-xs text-muted">{t.empty}</p>}
      {items.length > 0 && groups.length === 0 && <p className="px-1 py-2 text-xs text-muted">{t.noMatch(query)}</p>}

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {groups.map(([label, convs]) => (
          <div key={label} className="mb-3">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
            <ul className="flex flex-col gap-0.5">
              {convs.map((c) => (
                <li key={c.id} className={cx("group relative rounded-lg", c.id === activeId ? "bg-brand-soft" : "hover:bg-surface-2")}>
                  {editing === c.id ? (
                    <form
                      className="flex flex-col gap-1 p-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        rename(c.id);
                      }}
                    >
                      <label htmlFor={`rename-${c.id}`} className="sr-only">
                        {t.newTitle}
                      </label>
                      <input
                        id={`rename-${c.id}`}
                        autoFocus
                        value={title}
                        maxLength={120}
                        onChange={(e) => setTitle(e.target.value)}
                        onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                        className="rounded border border-line bg-surface px-2 py-1 text-sm"
                      />
                      <div className="flex gap-1">
                        <Button size="sm" type="submit" disabled={!title.trim()}>
                          {d.common.save}
                        </Button>
                        <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(null)}>
                          {d.common.cancel}
                        </Button>
                      </div>
                    </form>
                  ) : confirmDelete === c.id ? (
                    <div className="p-2 text-xs">
                      <p>{t.deleteConfirm(c.title)}</p>
                      <div className="mt-1 flex gap-1">
                        <Button size="sm" variant="danger" onClick={() => remove(c.id)}>
                          {d.common.delete}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                          {d.common.cancel}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-2 py-1.5">
                      <Link href={`/app/caption-studio?c=${c.id}`} className="min-w-0 flex-1" aria-current={c.id === activeId ? "page" : undefined}>
                        <p className="truncate text-sm">{c.title}</p>
                        {c.isExample && <Badge tone="accent">{d.common.example}</Badge>}
                      </Link>
                      <div className="flex shrink-0 gap-0.5 md:absolute md:right-1 md:top-1/2 md:-translate-y-1/2 md:rounded-md md:bg-surface md:px-0.5 md:opacity-0 md:shadow-sm md:group-hover:opacity-100 md:focus-within:opacity-100">
                        <button
                          type="button"
                          className="rounded px-1.5 text-xs text-muted hover:bg-surface"
                          aria-label={t.renameLabel(c.title)}
                          onClick={() => {
                            setEditing(c.id);
                            setTitle(c.title);
                          }}
                        >
                          {t.rename}
                        </button>
                        <button
                          type="button"
                          className="rounded px-1.5 text-xs text-danger hover:bg-danger-soft"
                          aria-label={t.deleteLabel(c.title)}
                          onClick={() => setConfirmDelete(c.id)}
                        >
                          {d.common.delete}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
