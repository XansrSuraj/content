import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/repo/creator";
import { providerStatus } from "@/lib/services/status";
import { t } from "@/lib/i18n";
import { signOut } from "@/app/actions/auth";
import { Badge } from "@/components/ui";
import { BottomNav, SideNav, type NavItem } from "./nav";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await requireUser();
  const db = await getDb();
  const [profile, status] = await Promise.all([getProfile(db, user.id), providerStatus(db)]);
  if (!profile?.onboardedAt) redirect("/onboarding");
  const lang = profile.uiLanguage;

  const items: NavItem[] = [
    { href: "/app", label: t(lang, "home"), icon: "⌂", mobile: true },
    { href: "/app/caption-studio", label: t(lang, "studio"), icon: "✎", mobile: true },
    { href: "/app/opportunities", label: t(lang, "opportunities"), icon: "◎", mobile: true },
    { href: "/app/briefs", label: t(lang, "briefs"), icon: "▤", mobile: true },
    { href: "/app/saved", label: t(lang, "saved"), icon: "☆" },
    { href: "/app/published", label: t(lang, "published"), icon: "↗" },
    { href: "/app/settings", label: t(lang, "settings"), icon: "⚙", mobile: true },
  ];
  if (user.role === "admin" && !user.isDemo) items.push({ href: "/admin", label: t(lang, "admin"), icon: "⛭" });

  const dataLabel = user.isDemo
    ? { tone: "accent" as const, text: "Demo trend data" }
    : status.enabledRealSources === 0
      ? { tone: "neutral" as const, text: "Trend provider unavailable" }
      : status.anyStale
        ? { tone: "warn" as const, text: "Source data stale" }
        : { tone: "ok" as const, text: `${status.enabledRealSources} observed source${status.enabledRealSources > 1 ? "s" : ""}` };

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface p-4 md:flex">
        <Link href="/app" className="mb-6 px-3 text-lg font-bold">
          Trend<span className="text-brand">Saathi</span>
        </Link>
        <SideNav items={items} />
        <div className="mt-auto space-y-2 px-3 text-xs text-muted">
          <p className="truncate" title={user.email}>
            {user.isDemo ? "Demo account" : user.email}
          </p>
          <form action={signOut}>
            <button type="submit" className="underline hover:text-fg">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 pb-20 md:pb-0">
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-line bg-canvas/95 px-4 py-2 backdrop-blur">
          <Link href="/app" className="mr-1 font-bold md:hidden">
            T<span className="text-brand">S</span>
          </Link>
          {user.isDemo && <Badge tone="accent">Demo mode</Badge>}
          {status.ai.kind === "live" ? (
            <Badge tone="ok" title={`Model: ${status.ai.model}`}>
              Live AI configured
            </Badge>
          ) : (
            <Badge tone="warn" title={`Missing: ${status.ai.missing.join(", ")}`}>
              AI not configured · template preview
            </Badge>
          )}
          <Link href="/app/settings#status">
            <Badge tone={dataLabel.tone}>{dataLabel.text}</Badge>
          </Link>
        </div>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </div>
      <BottomNav items={items} />
    </div>
  );
}
