"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, LinkButton, cx } from "@/components/ui";

export interface ConvSummary {
  id: string;
  title: string;
  updatedAt: string;
  isExample: boolean;
}

function groupLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return "Today";
  if (t >= startOfToday - 86_400_000) return "Yesterday";
  if (t >= startOfToday - 7 * 86_400_000) return "Previous 7 days";
  return "Older";
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
      const g = groupLabel(c.updatedAt, now);
      map.set(g, [...(map.get(g) ?? []), c]);
    }
    return [...map.entries()];
  }, [items, query]);

  async function rename(id: string) {
    const next = title.trim();
    if (!next) return;
    setError(null);
    const res = await fetch(`/api/captions/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: next }),
    });
    if (!res.ok) return setError("Rename failed.");
    setEditing(null);
    onChange(items.map((c) => (c.id === id ? { ...c, title: next } : c)));
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/captions/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) return setError("Delete failed.");
    setConfirmDelete(null);
    onChange(items.filter((c) => c.id !== id));
    if (id === activeId) router.push("/app/caption-studio?new=1");
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <LinkButton href="/app/caption-studio?new=1" size="sm" className="w-full">
        + New caption
      </LinkButton>
      {items.length > 4 && (
        <>
          <label htmlFor="conv-search" className="sr-only">
            Search conversations
          </label>
          <input
            id="conv-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-sm placeholder:text-muted/70"
          />
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {items.length === 0 && <p className="px-1 py-4 text-xs text-muted">No conversations yet. Your caption chats are saved here.</p>}
      {items.length > 0 && groups.length === 0 && <p className="px-1 py-2 text-xs text-muted">No chats match “{query}”.</p>}

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {groups.map(([label, convs]) => (
          <div key={label} className="mb-3">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
            <ul className="flex flex-col gap-0.5">
              {convs.map((c) => (
                <li key={c.id} className={cx("group rounded-lg", c.id === activeId ? "bg-brand-soft" : "hover:bg-surface-2")}>
                  {editing === c.id ? (
                    <form
                      className="flex flex-col gap-1 p-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        rename(c.id);
                      }}
                    >
                      <label htmlFor={`rename-${c.id}`} className="sr-only">
                        New title
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
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : confirmDelete === c.id ? (
                    <div className="p-2 text-xs">
                      <p>Delete “{c.title}”? This removes its messages.</p>
                      <div className="mt-1 flex gap-1">
                        <Button size="sm" variant="danger" onClick={() => remove(c.id)}>
                          Delete
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-2 py-1.5">
                      <Link href={`/app/caption-studio?c=${c.id}`} className="min-w-0 flex-1" aria-current={c.id === activeId ? "page" : undefined}>
                        <p className="truncate text-sm">{c.title}</p>
                        {c.isExample && <Badge tone="accent">Example</Badge>}
                      </Link>
                      <div className="flex shrink-0 gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                        <button
                          type="button"
                          className="rounded px-1.5 text-xs text-muted hover:bg-surface"
                          aria-label={`Rename ${c.title}`}
                          onClick={() => {
                            setEditing(c.id);
                            setTitle(c.title);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="rounded px-1.5 text-xs text-danger hover:bg-danger-soft"
                          aria-label={`Delete ${c.title}`}
                          onClick={() => setConfirmDelete(c.id)}
                        >
                          Delete
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
