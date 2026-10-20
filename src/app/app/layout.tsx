import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/repo/creator";
import { providerStatus } from "@/lib/services/status";
import { getServerDict } from "@/lib/i18n/server";
import { signOut } from "@/app/actions/auth";
import { after } from "next/server";
import { refreshIfStale } from "@/lib/services/trend-context";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { cx } from "@/components/ui";
import { BottomNav, SideNav, type NavItem } from "./nav";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await requireUser();
  const db = await getDb();
  const [profile, status, { d }] = await Promise.all([getProfile(db, user.id), providerStatus(db), getServerDict()]);
  if (!profile?.onboardedAt) redirect("/onboarding");
  const n = d.nav;
  // Keeps every enabled source fresh while people use the app — no cron or setup needed.
  after(() => refreshIfStale(db, new Date(), undefined, 20_000).catch(() => undefined));

  const items: NavItem[] = [
    { href: "/app", label: n.home, icon: "home", mobile: true },
    { href: "/app/caption-studio", label: n.studio, short: n.studioShort, icon: "studio", mobile: true },
    { href: "/app/trending", label: n.trending, short: n.trendingShort, icon: "trending", mobile: true },
    { href: "/app/opportunities", label: n.ideas, icon: "ideas", mobile: true },
    { href: "/app/briefs", label: n.briefs, icon: "briefs", mobile: true },
    { href: "/app/saved", label: n.saved, icon: "saved" },
    { href: "/app/published", label: n.published, icon: "published" },
    { href: "/app/settings", label: n.settings, icon: "settings", mobile: true },
  ];
  if (user.role === "admin" && !user.isDemo) items.push({ href: "/admin", label: n.admin, icon: "admin" });

  // One status indicator instead of a row of badges; details open on click.
  const ai =
    status.ai.kind === "live"
      ? { tone: "ok", text: d.status.aiLive, detail: status.ai.model }
      : status.ai.kind === "open"
        ? { tone: "ok", text: d.status.aiOpen, detail: `${status.ai.model} · ${status.ai.host}` }
        : status.ai.kind === "local"
          ? { tone: "info", text: d.status.aiLocal, detail: status.ai.model }
          : { tone: "warn", text: d.status.aiTemplate, detail: status.ai.note ?? status.ai.missing.join(", ") };
  const data = user.isDemo
    ? { tone: "accent", text: d.status.data.demo }
    : status.enabledRealSources === 0
      ? { tone: "neutral", text: d.status.data.none }
      : status.anyStale
        ? { tone: "warn", text: d.status.data.stale }
        : { tone: "ok", text: d.status.data.ok(status.enabledRealSources) };
  const dot: Record<string, string> = { ok: "bg-ok", info: "bg-info", warn: "bg-warn", accent: "bg-accent", neutral: "bg-muted" };

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-3 py-4 md:flex">
        <div className="mb-6 px-2">
          <Logo href="/app" />
        </div>
        <SideNav items={items} />
        <div className="mt-auto space-y-3 border-t border-line px-2 pt-3">
          <p className="truncate text-xs text-muted" title={user.email}>
            {user.isDemo ? n.demoAccount : user.email}
          </p>
          <form action={signOut}>
            <button type="submit" className="flex items-center gap-2 text-xs font-medium text-muted hover:text-fg">
              <LogOut aria-hidden className="h-3.5 w-3.5" />
              {d.common.signOut}
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 pb-20 md:pb-0">
        <header className="sticky top-0 z-20 flex h-[49px] items-center gap-2 border-b border-line bg-canvas/95 px-4 backdrop-blur">
          <div className="md:hidden">
            <Logo href="/app" compact />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {user.isDemo && (
              <span className="hidden rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent sm:inline">{d.status.demo}</span>
            )}
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                <span aria-hidden className={cx("h-2 w-2 rounded-full", dot[ai.tone])} />
                <span className="max-w-[9rem] truncate sm:max-w-none">{ai.text}</span>
                <span className="sr-only">{d.status.details}</span>
              </summary>
              <div className="absolute right-0 top-9 z-30 w-72 rounded-xl border border-line bg-surface p-3 text-xs shadow-lg">
                <p className="flex items-center gap-2 font-semibold">
                  <span aria-hidden className={cx("h-2 w-2 rounded-full", dot[ai.tone])} />
                  {ai.text}
                </p>
                {ai.detail && <p className="mt-0.5 break-words pl-4 text-muted">{ai.detail}</p>}
                <p className="mt-2 flex items-center gap-2 font-semibold">
                  <span aria-hidden className={cx("h-2 w-2 rounded-full", dot[data.tone])} />
                  {data.text}
                </p>
                {user.isDemo && <p className="mt-2 pl-4 text-accent">{d.status.demo}</p>}
                <Link href="/app/settings#status" className="mt-3 block pl-4 font-semibold text-brand underline">
                  {n.settings}
                </Link>
              </div>
            </details>
            <LanguageSwitcher compact />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </div>
      <BottomNav items={items} />
    </div>
  );
}
