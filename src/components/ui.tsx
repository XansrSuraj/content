import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { localeFor, type Lang } from "@/lib/i18n";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap";
const BTN_VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-brand-fg hover:opacity-90",
  secondary: "bg-surface text-fg border border-line hover:bg-surface-2",
  ghost: "text-fg hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
};
const BTN_SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], extra);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...props} className={buttonClass(variant, size, className)} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cx("rounded-xl border border-line bg-surface", className)} />;
}

type Tone = "neutral" | "brand" | "ok" | "warn" | "danger" | "info" | "accent";
const BADGE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  brand: "bg-brand-soft text-brand-ink",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent",
};

export function Badge({ tone = "neutral", className, children, title }: { tone?: Tone; className?: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", BADGE[tone], className)}>
      {children}
    </span>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warn" | "danger" | "ok" | "demo";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const map = {
    info: "border-info/30 bg-info-soft text-info",
    warn: "border-warn/30 bg-warn-soft text-warn",
    danger: "border-danger/30 bg-danger-soft text-danger",
    ok: "border-ok/30 bg-ok-soft text-ok",
    demo: "border-accent/30 bg-accent-soft text-accent",
  } as const;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-lg border px-3 py-2 text-sm", map[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cx(title ? "mt-0.5" : "", "text-fg/80")}>{children}</div>}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

const INPUT = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted/70";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(INPUT, "h-10", props.className)} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={cx(INPUT, "min-h-24", props.className)} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cx(INPUT, "h-10 pl-2.5 pr-7", props.className)} />;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function formatDateTime(d: Date | string | null | undefined, lang: Lang = "english"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(localeFor(lang), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(date) + " IST";
}

export function formatDate(d: Date | string | null | undefined, lang: Lang = "english"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(localeFor(lang), { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(date);
}

/** Request-time helpers kept outside component bodies. */
export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

/** Current time in IST formatted for a datetime-local input. */
export function istNowForInput(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 16);
}

const MODE_BADGE = {
  live_ai: { tone: "ok", text: "Live AI" },
  open_model: { tone: "ok", text: "Hosted AI" },
  local_ai: { tone: "info", text: "Local AI (development)" },
  template_preview: { tone: "warn", text: "Template preview — not AI" },
  example: { tone: "accent", text: "Example (pre-written)" },
} as const;

/** How a piece of content was generated — always visible to the creator. */
export function ModeBadge({ mode, label }: { mode: keyof typeof MODE_BADGE; label?: string }) {
  const m = MODE_BADGE[mode];
  return <Badge tone={m.tone}>{label ?? m.text}</Badge>;
}
