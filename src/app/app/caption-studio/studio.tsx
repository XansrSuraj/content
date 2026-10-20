"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CaptionContext } from "@/lib/domain/captions";
import { TONES } from "@/lib/domain/options";
import { getPlatform } from "@/lib/domain/platforms";
import type { ClientMessage } from "@/lib/services/serialize";
import { t, type UiLang } from "@/lib/i18n";
import { Badge, Button, Notice, Select, Textarea, cx } from "@/components/ui";
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

type ApiErr = { code: string; message: string; retryable?: boolean; retryAfterSeconds?: number };

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
  const router = useRouter();
  const [conversationId, setConversationId] = useState(props.conversationId);
  const [messages, setMessages] = useState(props.initialMessages);
  const [context, setContext] = useState<CaptionContext>(props.initialContext);
  const [draft, setDraft] = useState(props.prefill);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiErr | null>(null);
  const [lastSent, setLastSent] = useState<{ message: string; context: CaptionContext } | null>(null);
  const [applied, setApplied] = useState<string[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [regenTone, setRegenTone] = useState(context.tone);
  const [live, setLive] = useState<{ tokens: number; preview: string; startedAt: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lang = props.uiLanguage;
  const isFirstTurn = messages.length === 0;
  const platform = getPlatform(context.platform);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending]);

  async function send(message: string, ctx: CaptionContext = context) {
    const text = message.trim();
    if (!text || pending) return;
    setPending(true);
    setError(null);
    setLastSent({ message: text, context: ctx });
    setLive({ tokens: 0, preview: "", startedAt: Date.now() });
    try {
      const res = await fetch("/api/captions/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ conversationId, message: text, context: ctx, opportunityId: props.opportunityId }),
      });
      // Errors before streaming starts (auth, validation, origin) come back as plain JSON.
      if (!res.ok || !res.body || !res.headers.get("content-type")?.includes("ndjson")) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? { code: "network", message: "Something went wrong. Please try again.", retryable: true });
        return;
      }
      let data: { conversationId: string; context: CaptionContext; applied: string[]; userMessage: ClientMessage; assistantMessage: ClientMessage } | null = null;
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
          const evt = JSON.parse(line);
          if (evt.type === "progress") setLive((l) => (l ? { ...l, tokens: evt.tokens, preview: evt.preview || l.preview } : l));
          else if (evt.type === "error") setError(evt.error);
          else if (evt.type === "result") data = evt;
        }
      }
      if (!data) return;
      setMessages((m) => [...m, data.userMessage, data.assistantMessage]);
      setContext(data.context);
      setApplied(data.applied ?? []);
      setDraft("");
      if (!conversationId) {
        setConversationId(data.conversationId);
        router.replace(`/app/caption-studio?c=${data.conversationId}`, { scroll: false });
        router.refresh();
      }
    } catch {
      setError({ code: "network", message: "Network error. Check your connection and retry.", retryable: true });
    } finally {
      setPending(false);
      setLive(null);
    }
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <div className="-mx-4 -my-6 grid min-h-[calc(100dvh-49px)] md:grid-cols-[240px_1fr] lg:grid-cols-[240px_1fr_300px]">
      {/* Conversation list: drawer on mobile, column on desktop */}
      <div className={cx("border-r border-line bg-surface md:block", listOpen ? "fixed inset-0 z-40 block overflow-y-auto pt-2" : "hidden")}>
        <div className="flex items-center justify-between px-3 py-2 md:hidden">
          <p className="font-semibold">Conversations</p>
          <Button variant="ghost" size="sm" onClick={() => setListOpen(false)}>
            Close
          </Button>
        </div>
        <ConversationList items={props.conversations} activeId={conversationId} />
      </div>

      <section className="flex min-w-0 flex-col">
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

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
          {props.ai.kind === "none" && (
            <Notice tone="warn" title="AI is not configured on this server">
              Results are a <strong>template preview built from your own words</strong>, not AI rewrites.{" "}
              {props.ai.note ?? <>To enable real generation for free, set <code>AI_PROVIDER=ollama</code> in <code>.env.local</code> (needs Ollama), or set {props.ai.missing.join(" and ")}. Then restart the server.</>}
              {props.isDemo && " The example conversation in the list shows what live AI output looks like."}
            </Notice>
          )}
          {props.ai.kind === "local" && isFirstTurn && (
            <Notice tone="info" title="Local AI (development)">
              Captions come from <code>{props.ai.model}</code> running on this computer via Ollama — free, but slower and
              lower quality than the production model. Check every caption before posting.
            </Notice>
          )}

          {isFirstTurn && (
            <div className="mx-auto max-w-2xl pt-4 text-center">
              <h1 className="text-2xl font-bold">{t(lang, "studio")}</h1>
              <p className="mt-1 text-sm text-muted">{t(lang, "studioLead")}</p>
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-sm text-brand-fg">
                {m.text}
              </div>
            ) : m.result ? (
              <ResultCard
                key={m.id}
                message={m}
                result={m.result}
                conversationId={conversationId!}
                platformId={context.platform}
                outputMode={m.id === lastAssistant?.id ? context.outputMode : "full"}
              />
            ) : null,
          )}

          {pending && <LiveProgress live={live} kind={props.ai.kind} />}

          {error && (
            <Notice tone="danger" title={error.code === "quota" ? "Limit reached" : error.code === "local_unavailable" ? "Local AI unavailable" : "Couldn't generate captions"}>
              <p>{error.message}</p>
              {error.retryAfterSeconds ? <p className="mt-1">Try again in about {Math.ceil(error.retryAfterSeconds / 60)} min.</p> : null}
              {error.retryable !== false && error.code !== "quota" && lastSent && (
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => send(lastSent.message, lastSent.context)}>
                  Retry
                </Button>
              )}
              {error.code === "auth_error" && <p className="mt-1">The server&apos;s AI key was rejected. An admin needs to check ANTHROPIC_API_KEY.</p>}
            </Notice>
          )}
          {applied.length > 0 && !pending && (
            <p className="text-xs text-muted">Applied from your message: {applied.join(" · ")}</p>
          )}
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div className="sticky bottom-16 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur md:bottom-0">
          {!isFirstTurn && (
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
              send(draft);
            }}
            className="flex items-end gap-2"
          >
            <label htmlFor="composer" className="sr-only">
              Message
            </label>
            <Textarea
              id="composer"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              rows={isFirstTurn ? 4 : 2}
              maxLength={4000}
              placeholder={isFirstTurn ? t(lang, "studioPlaceholder") : t(lang, "followUpPlaceholder")}
              className="min-h-0 flex-1 resize-y"
            />
            <Button type="submit" disabled={pending || !draft.trim()}>
              {t(lang, "send")}
            </Button>
          </form>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="hidden sm:inline">Ctrl/⌘ + Enter to send.</span>
            {!isFirstTurn && (
              <span className="flex items-center gap-1">
                <label htmlFor="regen-tone">Regenerate in tone:</label>
                <Select id="regen-tone" value={regenTone} onChange={(e) => setRegenTone(e.target.value as CaptionContext["tone"])} className="h-8 w-auto py-0 text-xs">
                  {TONES.map((tn) => (
                    <option key={tn.id} value={tn.id}>
                      {tn.label}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    const ctx = { ...context, tone: regenTone };
                    setContext(ctx);
                    send(`Same topic, teen naye options ${regenTone} tone mein do.`, ctx);
                  }}
                >
                  Regenerate
                </Button>
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Context panel: sheet on mobile/tablet, column on large screens */}
      <aside
        className={cx(
          "border-l border-line bg-surface lg:block",
          panelOpen ? "fixed inset-0 z-40 block overflow-y-auto" : "hidden",
        )}
        aria-label="Caption settings"
      >
        <div className="flex items-center justify-between px-4 pt-3 lg:hidden">
          <p className="font-semibold">Caption settings</p>
          <Button variant="secondary" size="sm" onClick={() => setPanelOpen(false)}>
            Done
          </Button>
        </div>
        <ContextPanel context={context} onChange={setContext} hasConversation={!isFirstTurn} />
      </aside>
    </div>
  );
}

/** Live status while captions are generated: elapsed time, progress and a preview of option A. */
function LiveProgress({ live, kind }: { live: { tokens: number; preview: string; startedAt: number } | null; kind: "live" | "local" | "none" }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
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
    <div role="status" aria-live="polite" className="max-w-2xl rounded-xl border border-line bg-surface p-4 text-sm">
      <div className="flex items-center justify-between gap-2 text-muted">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand" aria-hidden />
          {label}
        </span>
        <span className="tabular-nums">
          {seconds}s{live?.tokens ? ` · ${live.tokens} words/pieces` : ""}
        </span>
      </div>
      {live?.preview && (
        <div className="mt-3 rounded-lg bg-surface-2 p-3">
          <p className="text-xs font-semibold text-muted">Option A (writing…)</p>
          <p className="mt-1 whitespace-pre-wrap">{live.preview}</p>
        </div>
      )}
    </div>
  );
}
