"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, LinkButton, cx } from "@/components/ui";

export interface ConvSummary {
  id: string;
  title: string;
  updatedAt: string;
  isExample: boolean;
}

export function ConversationList({ items, activeId }: { items: ConvSummary[]; activeId: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rename(id: string) {
    setError(null);
    const res = await fetch(`/api/captions/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return setError("Rename failed.");
    setEditing(null);
    router.refresh();
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/captions/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) return setError("Delete failed.");
    setConfirmDelete(null);
    if (id === activeId) router.push("/app/caption-studio");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <LinkButton href="/app/caption-studio?new=1" size="sm" className="w-full">
        + New caption
      </LinkButton>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {items.length === 0 && <p className="px-1 py-4 text-xs text-muted">No conversations yet. Your caption chats are saved here.</p>}
      <ul className="flex flex-col gap-1">
        {items.map((c) => (
          <li key={c.id} className={cx("group rounded-lg", c.id === activeId && "bg-brand-soft")}>
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
              <div className="flex items-start gap-1 p-2">
                <Link href={`/app/caption-studio?c=${c.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.title}</p>
                  <p className="text-[11px] text-muted">
                    {new Date(c.updatedAt).toLocaleDateString("en-IN")} {c.isExample && <Badge tone="accent">Example</Badge>}
                  </p>
                </Link>
                <div className="flex shrink-0 gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                  <button
                    type="button"
                    className="rounded px-1.5 text-xs text-muted hover:bg-surface-2"
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
  );
}
