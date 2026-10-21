import Link from "next/link";
import { BadgeCheck, FileText, MessageSquare, Sparkles, TrendingUp } from "lucide-react";
import { Logo } from "@/components/logo";
import { config } from "@/lib/config";
import { getCurrentUser } from "@/lib/auth/session";
import { getServerDict } from "@/lib/i18n/server";
import { startDemo } from "@/app/actions/auth";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Badge, Button, Card, LinkButton } from "@/components/ui";

const FEATURE_ICONS = [MessageSquare, TrendingUp, FileText];

export default async function Landing() {
  const user = await getCurrentUser();
  const { d } = await getServerDict();
  const demo = config().demoEnabled;
  const L = d.landing;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line/60 bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <nav className="flex items-center gap-2">
            <LanguageSwitcher compact />
            {user ? (
              <LinkButton href="/app" size="sm">
                {L.openApp}
              </LinkButton>
            ) : (
              <LinkButton href="/signin" size="sm" variant="secondary">
                {L.signIn}
              </LinkButton>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20">
        <section className="grid items-center gap-12 py-12 md:grid-cols-2 md:py-20">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-muted">
              <Sparkles aria-hidden className="h-3.5 w-3.5 text-brand" />
              English · Hinglish · हिन्दी
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
              {L.heroTitleA} <span className="text-brand">{L.heroTitleB}</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">{L.heroLead}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {user ? (
                <LinkButton href="/app/caption-studio">{L.openStudio}</LinkButton>
              ) : (
                <>
                  <LinkButton href="/signin?mode=signup">{L.createAccount}</LinkButton>
                  {demo && (
                    <form action={startDemo}>
                      <Button type="submit" variant="secondary">
                        {L.tryDemo}
                      </Button>
                    </form>
                  )}
                </>
              )}
            </div>
            {demo && !user && <p className="mt-3 text-xs text-muted">{L.demoNote}</p>}
          </div>

          <Card className="p-5 shadow-sm" aria-label={L.previewTitle}>
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquare aria-hidden className="h-4 w-4 text-brand" />
                {L.previewTitle}
              </p>
              <Badge tone="accent">{d.common.example}</Badge>
            </div>
            <div className="mt-4 flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-sm text-brand-fg">{L.previewInput}</p>
            </div>
            <div className="mt-4 space-y-2">
              {[L.previewA, L.previewB, L.previewC].map(([k, v], i) => (
                <div key={k} className={i === 0 ? "rounded-lg border border-brand bg-brand-soft/40 p-3" : "rounded-lg border border-line p-3"}>
                  <p className="text-xs font-semibold text-brand">{k}</p>
                  <p className="mt-0.5 text-sm">{v}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">#MatchPreview #DerbyDay · {L.previewTags}</p>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {L.features.map((f, i) => {
            const Icon = FEATURE_ICONS[i] ?? Sparkles;
            return (
              <Card key={f.t} className="p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand-ink">
                  <Icon aria-hidden className="h-5 w-5" />
                </span>
                <h2 className="mt-4 font-semibold">{f.t}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.d}</p>
              </Card>
            );
          })}
        </section>

        <section className="mt-10 rounded-xl border border-line bg-surface p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <BadgeCheck aria-hidden className="h-5 w-5 text-ok" />
            {L.honestyTitle}
          </h2>
          <ul className="mt-3 grid gap-3 text-sm text-muted md:grid-cols-2">
            {L.honesty.map((h) => (
              <li key={h} className="flex gap-2">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                {h}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-line py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-xs text-muted sm:flex-row">
          <span>
            <span className="font-semibold text-fg">TrendSaathi</span> · {d.common.tagline}
          </span>
          <Link href="/signin" className="underline">
            {L.signIn}
          </Link>
        </div>
      </footer>
    </div>
  );
}
