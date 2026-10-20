import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { eventCounts, getProfile, personalizationAllowed } from "@/lib/repo/creator";
import { providerStatus } from "@/lib/services/status";
import { SOURCES } from "@/lib/providers/trends/catalog";
import { deleteMyAccount, deleteMyHistory, signOutEverywhere, updateConsent } from "@/app/actions/profile";
import { ProfileFields } from "@/components/profile-fields";
import { Badge, Button, Card, Input, Notice, PageHeader, formatDateTime } from "@/components/ui";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Settings" };

const STATUS_TONE = { enabled: "ok", needs_config: "warn", disabled: "neutral", unavailable: "neutral", demo: "accent" } as const;
const STATUS_TEXT = { enabled: "Enabled", needs_config: "Needs configuration", disabled: "Disabled", unavailable: "Not available", demo: "Demo only" } as const;

export default async function SettingsPage(props: PageProps<"/app/settings">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const db = await getDb();
  const [profile, status, consent, counts] = await Promise.all([
    getProfile(db, user.id),
    providerStatus(db),
    personalizationAllowed(db, user.id),
    eventCounts(db, user.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader title="Settings" />
      {sp.deleted === "history" && <Notice tone="ok">Your history was deleted.</Notice>}
      {sp.error === "confirm" && <Notice tone="danger">Type DELETE in capitals to confirm.</Notice>}

      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Creator preferences</h2>
        <ProfileForm>
          <ProfileFields profile={profile} />
        </ProfileForm>
      </Card>

      <Card className="p-5" id="status">
        <h2 className="font-semibold">AI & data sources</h2>
        <div className="mt-3 rounded-lg border border-line p-3 text-sm">
          <p className="font-semibold">AI provider</p>
          {status.ai.kind === "live" ? (
            <p className="mt-1"><Badge tone="ok">Live AI configured</Badge> Model: <code>{status.ai.model}</code></p>
          ) : (
            <p className="mt-1">
              <Badge tone="warn">Not configured</Badge> Missing: {status.ai.missing.join(", ")}. Caption Studio shows a labeled template preview until these are set on the server.
            </p>
          )}
        </div>
        <ul className="mt-3 space-y-2">
          {status.sources.map((s) => {
            const info = SOURCES.find((x) => x.key === s.key)!;
            return (
              <li key={s.key} className="rounded-lg border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{s.name}</span>
                  <Badge tone={STATUS_TONE[s.status as keyof typeof STATUS_TONE]}>{STATUS_TEXT[s.status as keyof typeof STATUS_TEXT]}</Badge>
                  {s.stale && <Badge tone="warn">Stale</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted">{info.coverage}</p>
                {s.status === "enabled" && (
                  <p className="mt-1 text-xs">Last successful fetch: {s.lastSuccessAt ? formatDateTime(s.lastSuccessAt) : "never"}{s.lastError ? ` · Last error: ${s.lastError}` : ""}</p>
                )}
                {s.status !== "enabled" && s.missing.length > 0 && <p className="mt-1 text-xs">Requires: {s.missing.join("; ")}</p>}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">Personalization & privacy</h2>
        <form action={updateConsent} className="mt-3 flex items-start gap-3 text-sm">
          <input id="granted" name="granted" type="checkbox" defaultChecked={consent} className="mt-1 h-4 w-4" />
          <label htmlFor="granted">
            Use my own saves and “not for me” feedback to rank my ideas feed.
            <span className="block text-xs text-muted">Only your data, only for you. Captions are never pooled across creators or used for training by TrendSaathi.</span>
          </label>
          <Button type="submit" size="sm" variant="secondary">Update</Button>
        </form>
        <div className="mt-4 text-xs text-muted">
          Your activity (counts only):{" "}
          {Object.keys(counts).length ? Object.entries(counts).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ") : "none yet"}
        </div>
      </Card>

      <Card className="border-danger/40 p-5">
        <h2 className="font-semibold text-danger">Danger zone</h2>
        <form action={signOutEverywhere} className="mt-3">
          <Button type="submit" variant="secondary" size="sm">Sign out of all devices</Button>
        </form>
        <form action={deleteMyHistory} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-sm font-semibold" htmlFor="confirm-history">Delete all history</label>
            <p className="text-xs text-muted">Caption conversations, saved captions, briefs, saved items, published links, feedback and activity. Keeps your account and preferences.</p>
            <Input id="confirm-history" name="confirm" placeholder="Type DELETE" autoComplete="off" className="mt-1" />
          </div>
          <Button type="submit" variant="danger" size="sm">Delete history</Button>
        </form>
        <form action={deleteMyAccount} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-sm font-semibold" htmlFor="confirm-account">Delete account</label>
            <p className="text-xs text-muted">Permanently removes your account and everything in it.</p>
            <Input id="confirm-account" name="confirm" placeholder="Type DELETE" autoComplete="off" className="mt-1" />
          </div>
          <Button type="submit" variant="danger" size="sm">Delete account</Button>
        </form>
      </Card>
    </div>
  );
}
