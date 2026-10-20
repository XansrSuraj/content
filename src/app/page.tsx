import Link from "next/link";
import { config } from "@/lib/config";
import { getCurrentUser } from "@/lib/auth/session";
import { startDemo } from "@/app/actions/auth";
import { Badge, Button, Card, LinkButton } from "@/components/ui";

export default async function Landing() {
  const user = await getCurrentUser();
  const demo = config().demoEnabled;

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <span className="text-lg font-bold">
          Trend<span className="text-brand">Saathi</span>
        </span>
        <nav className="flex items-center gap-2">
          {user ? (
            <LinkButton href="/app" size="sm">
              Open app
            </LinkButton>
          ) : (
            <LinkButton href="/signin" size="sm" variant="secondary">
              Sign in
            </LinkButton>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16">
        <section className="grid items-center gap-10 py-10 md:grid-cols-2 md:py-16">
          <div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Sahi trend. Apna original angle. <span className="text-brand">Behtar content.</span>
            </h1>
            <p className="mt-4 max-w-lg text-lg text-muted">
              Hindi, Hinglish aur English creators ke liye caption studio aur content planner. Paste your caption, get
              three genuinely different options, and see the evidence behind every idea.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {user ? (
                <LinkButton href="/app/caption-studio">Open Caption Studio</LinkButton>
              ) : demo ? (
                <form action={startDemo}>
                  <Button type="submit">Try the demo</Button>
                </form>
              ) : null}
              {!user && (
                <LinkButton href="/signin?mode=signup" variant="secondary">
                  Create account
                </LinkButton>
              )}
            </div>
            {demo && !user && (
              <p className="mt-3 text-xs text-muted">Demo uses clearly labeled sample data and a private, temporary account.</p>
            )}
          </div>

          <Card className="p-5" aria-label="Example of a Caption Studio result">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Caption Studio</p>
              <Badge tone="accent">Example</Badge>
            </div>
            <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">
              Aaj maine apne budget phone se cinematic video shoot kiya. Instagram ke liye better caption do.
            </p>
            <div className="mt-3 space-y-2">
              {[
                ["Curiosity hook", "Ye shot mehenge camera se nahi, mere budget phone se hai."],
                ["Story-first", "Socha tha naya phone lena padega… phir purane phone se try kiya."],
                ["Practical value", "Budget phone, cinematic look: light, steady hands, slow movement."],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line p-3">
                  <p className="text-xs font-semibold text-brand">{k}</p>
                  <p className="text-sm">{v}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">#MobileFilmmaking #BudgetPhone · Relevant hashtag suggestions. Current trend status not verified.</p>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            {
              t: "Caption Studio",
              d: "Paste a caption, then follow up naturally: “aur short karo”, “emoji hata do”, “YouTube Shorts ke liye adapt karo”. Your constraints stick.",
            },
            {
              t: "Ideas with evidence",
              d: "Opportunities filtered by category, language and platform. Each shows its source, observation time and coverage — or says plainly that it's an idea without evidence.",
            },
            {
              t: "Briefs you can shoot",
              d: "Turn an idea into hooks, an opening shot, beats, a CTA and a low-effort phone version, with facts to verify listed separately.",
            },
          ].map((f) => (
            <Card key={f.t} className="p-5">
              <h2 className="font-semibold">{f.t}</h2>
              <p className="mt-1 text-sm text-muted">{f.d}</p>
            </Card>
          ))}
        </section>

        <section className="mt-10 rounded-xl border border-line bg-surface p-5">
          <h2 className="font-semibold">Seedhi baat</h2>
          <ul className="mt-2 grid gap-2 text-sm text-muted md:grid-cols-2">
            <li>No promise of virality. Watch time, retention and shares matter more than hashtags.</li>
            <li>A hashtag is only marked as observed when a stored source shows it — otherwise it is a suggestion.</li>
            <li>No invented views, growth percentages or “live” counters. Unknown stays unknown.</li>
            <li>Your captions and history are private to you and can be deleted at any time.</li>
          </ul>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        TrendSaathi · <Link href="/signin" className="underline">Sign in</Link>
      </footer>
    </div>
  );
}
