"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CaptionContext } from "@/lib/domain/captions";
import { TONES } from "@/lib/domain/options";
import { getPlatform } from "@/lib/domain/platforms";
import type { ClientMessage } from "@/lib/services/serialize";
import { t, type UiLang } from "@/lib/i18n";
import { Badge, Button, Notice, Select, cx } from "@/components/ui";
import { ContextPanel } from "./context-panel";
import { ConversationList, type ConvSummary } from "./conversation-list";
import { ResultCard } from "./result-card";

const QUICK_FOLLOWUPS = [
  "Aur short karo.",
  "Isko funny Hinglish mein likho.",
  "Promotional kam rakho.",
  "Meri first line same rakho.",
  "YouTube Shorts ke liye adapt karo.",
  "Emoji hata do.",
  "Sirf final caption aur hashtags do.",
];

const STARTERS = [
  "Aaj maine apne budget phone se cinematic video shoot kiya. Instagram ke liye better Hinglish caption aur hashtags do.",
  "Ghar par cafe-style chai banayi, tapri wali feel ke saath. Reel ke liye funny caption do.",
  "Exam se pehle 3 study tips ka video banaya. YouTube Shorts ke liye title aur caption do.",
];

type ApiErr = { code: string; message: string; retryable?: boolean; retryAfterSeconds?: number };
type Live = { tokens: number; preview: string; startedAt: number };
type TurnResult = { conversationId: string; context: CaptionContext; applied: string[]; userMessage: ClientMessage; assistantMessage: ClientMessage };

const draftKey = (id: string | null) => `ts-draft:${id ?? "new"}`;
function readDraft(id: string | null): string | null {
  try {
    return window.localStorage.getItem(draftKey(id));
  } catch {
    return null;
  }
}
function writeDraft(id: string | null, value: string) {
  try {
    if (value.trim()) window.localStorage.setItem(draftKey(id), value);
    else window.localStorage.removeItem(draftKey(id));
  } catch {
    /* storage unavailable (private mode) — drafts just aren't kept */
  }
}

export function Studio(props: {
  conversations: ConvSummary[];
  conversationId: string | null;
  initialMessages: ClientMessage[];
  initialContext: CaptionContext;
  prefill: string;
  opportunityId: string | null;
  ai: { kind: "live" } | { kind: "local"; model: string } | { kind: "none"; missing: string[]; note?: string };
  uiLanguage: UiLang;
  isDemo: boolean;
}) {
  const [conversationId, setConversationId] = useState(props.conversationId);
  const [conversations, setConversations] = useState(props.conversations);
  const [messages, setMessages] = useState(props.initialMessages);
  const [context, setContext] = useState<CaptionContext>(props.initialContext);
  const [draft, setDraft] = useState(props.prefill);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiErr | null>(null);
  const [lastSent, setLastSent] = useState<{ message: string; context: CaptionContext } | null>(null);
  const [applied, setApplied] = useState<string[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [regenTone, setRegenTone] = useState(props.initialContext.tone);
  const [live, setLive] = useState<Live | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  /** True while the view should follow new content (like chat apps); false once the user scrolls up. */
  const stickRef = useRef(true);
  const programmaticRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const turnRef = useRef<string | null>(null);
  const lang = props.uiLanguage;
  const isEmpty = messages.length === 0;
  const platform = getPlatform(context.platform);
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  // Restore an unsent draft for this conversation (unless the page was opened with a prefill).
  useEffect(() => {
    if (!props.prefill) {
      const saved = readDraft(props.conversationId);
      // localStorage only exists after mount; reading it during render would break hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setDraft(saved);
    }
    // Focus the composer on desktop, like chat apps do.
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, [props.conversationId, props.prefill]);

  useEffect(() => {
    writeDraft(conversationId, draft);
  }, [conversationId, draft]);

  // Auto-grow the composer up to ~8 lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [draft]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    programmaticRef.current = true;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => {
      programmaticRef.current = false;
    });
  }, []);

  // Follow content as it grows (new messages, streaming preview, cards expanding) while pinned.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const ro = new ResizeObserver(() => {
      if (stickRef.current) scrollToBottom();
    });
    ro.observe(content);
    scrollToBottom();
    return () => ro.disconnect();
  }, [scrollToBottom]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el || programmaticRef.current) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickRef.current = near;
    setAtBottom(near);
  }

  function stop() {
    const turnId = turnRef.current;
    // Tell the server explicitly (proxies may not forward a disconnect), then drop the stream.
    if (turnId) {
      fetch("/api/captions/turn/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnId }),
        keepalive: true,
      }).catch(() => undefined);
    }
    abortRef.current?.abort();
  }

  async function send(message: string, ctx: CaptionContext = context) {
    const text = message.trim();
    if (!text || pending) return;
    const tempId = `tmp-${Date.now()}`;
    // Optimistic: the creator's message appears immediately.
    setMessages((m) => [
      ...m,
      { id: tempId, role: "user", text, mode: null, result: null, hashtags: [], contextUsed: null, createdAt: new Date().toISOString() },
    ]);
    setDraft("");
    setPending(true);
    setError(null);
    setApplied([]);
    stickRef.current = true;
    setAtBottom(true);
    setLastSent({ message: text, context: ctx });
    setLive({ tokens: 0, preview: "", startedAt: Date.now() });
    const controller = new AbortController();
    abortRef.current = controller;
    const turnId = crypto.randomUUID();
    turnRef.current = turnId;

    const dropTemp = () => setMessages((m) => m.filter((x) => x.id !== tempId));
    try {
      const res = await fetch("/api/captions/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ conversationId, message: text, context: ctx, opportunityId: props.opportunityId, turnId }),
        signal: controller.signal,
      });
      // Errors before streaming starts (auth, validation, origin) come back as plain JSON.
      if (!res.ok || !res.body || !res.headers.get("content-type")?.includes("ndjson")) {
        const data = await res.json().catch(() => null);
        dropTemp();
        setDraft(text);
        setError(data?.error ?? { code: "network", message: "Something went wrong. Please try again.", retryable: true });
        return;
      }
      let data: TurnResult | null = null;
      let streamError: ApiErr | null = null;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: { type: string; tokens?: number; preview?: string; error?: ApiErr } & Partial<TurnResult>;
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.type === "progress") setLive((l) => (l ? { ...l, tokens: evt.tokens ?? l.tokens, preview: evt.preview || l.preview } : l));
          else if (evt.type === "error") streamError = evt.error ?? null;
          else if (evt.type === "result") data = evt as unknown as TurnResult;
        }
      }
      if (!data) {
        dropTemp();
        setDraft(text);
        if (streamError?.code !== "cancelled") setError(streamError ?? { code: "network", message: "The connection closed early. Please retry.", retryable: true });
        return;
      }
      const result: TurnResult = data;
      setMessages((m) => [...m.filter((x) => x.id !== tempId), result.userMessage, result.assistantMessage]);
      setContext(result.context);
      setApplied(result.applied ?? []);
      if (!conversationId) {
        // Seamless like chat apps: update the URL and sidebar without reloading the page.
        setConversationId(result.conversationId);
        writeDraft(null, "");
        window.history.replaceState(null, "", `/app/caption-studio?c=${result.conversationId}`);
        const line = text.split(/\r?\n/).find((l) => l.trim()) ?? text;
        setConversations((c) => [
          { id: result.conversationId, title: line.length > 60 ? `${line.slice(0, 57)}…` : line, updatedAt: new Date().toISOString(), isExample: false },
          ...c,
        ]);
      } else {
        setConversations((c) => {
          const cur = c.find((x) => x.id === conversationId);
          return cur ? [{ ...cur, updatedAt: new Date().toISOString() }, ...c.filter((x) => x.id !== conversationId)] : c;
        });
      }
    } catch (err) {
      dropTemp();
      setDraft(text);
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError({ code: "network", message: "Network error. Check your connection and retry.", retryable: true });
      }
    } finally {
      abortRef.current = null;
      turnRef.current = null;
      setPending(false);
      setLive(null);
      if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Never send while an IME (e.g. Hindi/Devanagari input) is composing a word.
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape" && pending) {
      e.preventDefault();
      stop();
      return;
    }
    if (e.key !== "Enter") return;
    // Desktop: Enter sends, Shift+Enter is a new line. Touch keyboards: Enter is a new line (Send button sends).
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if ((e.ctrlKey || e.metaKey) || (!e.shiftKey && !touch)) {
      e.preventDefault();
      send(draft);
    }
  }

  function regenerate() {
    const ctx = { ...context, tone: regenTone };
    setContext(ctx);
    send(
      regenTone === context.tone ? "Wahi topic, teen naye aur alag options do." : `Same topic, teen naye options ${regenTone} tone mein do.`,
      ctx,
    );
  }

  return (
    <div className="-mx-4 -my-6 grid h-[calc(100dvh-49px-4rem)] md:h-[calc(100dvh-49px)] md:grid-cols-[260px_1fr] lg:grid-cols-[260px_1fr_300px]">
      {/* Conversation list: drawer on mobile, column on desktop */}
      <div className={cx("min-h-0 border-r border-line bg-surface md:block", listOpen ? "fixed inset-0 z-40 block overflow-y-auto pt-2" : "hidden")}>
        <div className="flex items-center justify-between px-3 py-2 md:hidden">
          <p className="font-semibold">Conversations</p>
          <Button variant="ghost" size="sm" onClick={() => setListOpen(false)}>
            Close
          </Button>
        </div>
        <ConversationList items={conversations} activeId={conversationId} onChange={setConversations} />
      </div>

      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2 lg:hidden">
          <Button variant="secondary" size="sm" onClick={() => setListOpen(true)} className="md:hidden">
            Chats
          </Button>
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-left"
            aria-label="Edit caption settings"
          >
            <Badge tone="brand">{platform.label}</Badge>
            <Badge>{context.language}</Badge>
            <Badge>{context.tone}</Badge>
            {context.emoji === "none" && <Badge>No emoji</Badge>}
            <span className="ml-1 shrink-0 text-xs font-semibold text-brand underline">Edit</span>
          </button>
        </div>

        {/* Chat scroll area */}
        <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto">
          <div ref={contentRef} className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
            {props.ai.kind === "none" && (
              <Notice tone="warn" title="AI is not configured on this server">
                Results are a <strong>template preview built from your own words</strong>, not AI rewrites.{" "}
                {props.ai.note ?? (
                  <>
                    To enable real generation for free, set <code>AI_PROVIDER=ollama</code> in <code>.env.local</code> (needs Ollama), or set{" "}
                    {props.ai.missing.join(" and ")}. Then restart the server.
                  </>
                )}
                {props.isDemo && " The example conversation in the list shows what live AI output looks like."}
              </Notice>
            )}
            {props.ai.kind === "local" && isEmpty && (
              <Notice tone="info" title="Local AI (development)">
                Captions come from <code>{props.ai.model}</code> running on this computer via Ollama — free, but slower and lower quality than
                the production model. Check every caption before posting.
              </Notice>
            )}

            {isEmpty && (
              <div className="pt-6 text-center">
                <h1 className="text-2xl font-bold">{t(lang, "studio")}</h1>
                <p className="mt-1 text-sm text-muted">{t(lang, "studioLead")}</p>
                <div className="mt-6 grid gap-2 text-left sm:grid-cols-3">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setDraft(s);
                        inputRef.current?.focus();
                      }}
                      className="rounded-xl border border-line bg-surface p-3 text-sm text-muted hover:border-brand hover:text-fg"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div
                    className={cx(
                      "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-[15px] text-brand-fg",
                      m.id.startsWith("tmp-") && "opacity-90",
                    )}
                  >
                    {m.text}
                  </div>
                </div>
              ) : m.result ? (
                <ResultCard
                  key={m.id}
                  message={m}
                  result={m.result}
                  conversationId={conversationId!}
                  platformId={context.platform}
                  outputMode={m.id === lastAssistant?.id ? context.outputMode : "full"}
                  compact={m.id !== lastAssistant?.id}
                />
              ) : null,
            )}

            {pending && <LiveProgress live={live} kind={props.ai.kind} />}

            {error && (
              <Notice
                tone="danger"
                title={error.code === "quota" || error.code === "upstream_rate_limited" ? "Limit reached" : error.code === "local_unavailable" ? "Local AI unavailable" : "Couldn't generate captions"}
              >
                <p>{error.message}</p>
                {error.retryAfterSeconds ? <p className="mt-1">Try again in about {Math.ceil(error.retryAfterSeconds / 60)} min.</p> : null}
                {error.retryable !== false && error.code !== "quota" && lastSent && (
                  <Button size="sm" variant="secondary" className="mt-2" onClick={() => send(lastSent.message, lastSent.context)}>
                    Retry
                  </Button>
                )}
                {error.code === "auth_error" && <p className="mt-1">The server&apos;s AI key was rejected. An admin needs to check the API key.</p>}
              </Notice>
            )}

            {!pending && lastAssistant && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <Button size="sm" variant="secondary" onClick={regenerate}>
                  ↻ Naye options
                </Button>
                <label htmlFor="regen-tone" className="sr-only">
                  Tone for new options
                </label>
                <span className="inline-block w-40">
                  <Select id="regen-tone" value={regenTone} onChange={(e) => setRegenTone(e.target.value as CaptionContext["tone"])} className="h-8 py-0 text-xs">
                    {TONES.map((tn) => (
                      <option key={tn.id} value={tn.id}>
                        {tn.label}
                      </option>
                    ))}
                  </Select>
                </span>
                {applied.length > 0 && <span>Applied: {applied.join(" · ")}</span>}
              </div>
            )}
          </div>

          {!atBottom && (
            <button
              type="button"
              onClick={() => {
                stickRef.current = true;
                setAtBottom(true);
                scrollToBottom();
              }}
              aria-label="Scroll to latest message"
              className="sticky bottom-3 left-full mr-4 ml-auto flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface shadow-md"
            >
              ↓
            </button>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-line bg-canvas px-4 pb-3 pt-2">
          <div className="mx-auto w-full max-w-3xl">
            {!isEmpty && (
              <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                {QUICK_FOLLOWUPS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={pending}
                    onClick={() => send(q)}
                    className="shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium hover:border-brand disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (pending) stop();
                else send(draft);
              }}
              className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 focus-within:border-brand"
            >
              <label htmlFor="composer" className="sr-only">
                Message
              </label>
              <textarea
                id="composer"
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={4000}
                placeholder={isEmpty ? t(lang, "studioPlaceholder") : t(lang, "followUpPlaceholder")}
                className="max-h-[220px] min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] text-fg outline-none placeholder:text-muted/70"
              />
              {pending ? (
                <Button type="submit" variant="secondary" aria-label="Stop generating" className="h-10 shrink-0 rounded-xl">
                  ■ Stop
                </Button>
              ) : (
                <Button type="submit" disabled={!draft.trim()} className="h-10 shrink-0 rounded-xl">
                  {t(lang, "send")}
                </Button>
              )}
            </form>
            <p className="mt-1.5 hidden text-center text-[11px] text-muted sm:block">
              Enter = send · Shift+Enter = new line{pending ? " · Esc = stop" : ""} · AI can make mistakes — check facts before posting.
            </p>
          </div>
        </div>
      </section>

      {/* Context panel: sheet on mobile/tablet, column on large screens */}
      <aside
        className={cx("min-h-0 overflow-y-auto border-l border-line bg-surface lg:block", panelOpen ? "fixed inset-0 z-40 block" : "hidden")}
        aria-label="Caption settings"
      >
        <div className="flex items-center justify-between px-4 pt-3 lg:hidden">
          <p className="font-semibold">Caption settings</p>
          <Button variant="secondary" size="sm" onClick={() => setPanelOpen(false)}>
            Done
          </Button>
        </div>
        <ContextPanel context={context} onChange={setContext} hasConversation={!isEmpty} />
      </aside>
    </div>
  );
}

/** Assistant "typing" state: elapsed time, progress and a live preview of option A when the provider streams. */
function LiveProgress({ live, kind }: { live: Live | null; kind: "live" | "local" | "none" }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = live ? Math.max(0, Math.round((now - live.startedAt) / 1000)) : 0;
  const label =
    kind === "live"
      ? "Captions likh rahe hain…"
      : kind === "local"
        ? live?.tokens
          ? "Local model likh raha hai…"
          : "Local model aapka message padh raha hai…"
        : "Building template preview…";
  return (
    <div role="status" aria-live="polite" className="rounded-2xl border border-line bg-surface p-4 text-sm">
      <div className="flex items-center justify-between gap-2 text-muted">
        <span className="flex items-center gap-2">
          <span className="flex gap-1" aria-hidden>
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand" />
          </span>
          {label}
        </span>
        <span className="tabular-nums">{seconds}s</span>
      </div>
      {live?.preview ? (
        <div className="mt-3 rounded-lg bg-surface-2 p-3">
          <p className="text-xs font-semibold text-muted">Option A (writing…)</p>
          <p className="mt-1 whitespace-pre-wrap">{live.preview}</p>
        </div>
      ) : (
        <div className="mt-3 space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-2" />
          ))}
        </div>
      )}
    </div>
  );
}
