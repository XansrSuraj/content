import { Languages, LogOut } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { eventCounts, getProfile, personalizationAllowed } from "@/lib/repo/creator";
import { providerStatus } from "@/lib/services/status";
import { SOURCES } from "@/lib/providers/trends/catalog";
import { getServerDict } from "@/lib/i18n/server";
import { deleteMyAccount, deleteMyHistory, signOutEverywhere, updateConsent } from "@/app/actions/profile";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ProfileFields } from "@/components/profile-fields";
import { Badge, Button, Card, Input, Notice, PageHeader, formatDateTime } from "@/components/ui";
import { ProfileForm } from "./profile-form";

export async function generateMetadata() {
  const { d } = await getServerDict();
  return { title: d.settings.title };
}

const STATUS_TONE = { enabled: "ok", needs_config: "warn", disabled: "neutral", unavailable: "neutral", demo: "accent" } as const;

export default async function SettingsPage(props: PageProps<"/app/settings">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const db = await getDb();
  const [profile, status, consent, counts, { lang, d }] = await Promise.all([
    getProfile(db, user.id),
    providerStatus(db),
    personalizationAllowed(db, user.id),
    eventCounts(db, user.id),
    getServerDict(),
  ]);
  const t = d.settings;
  const ai = status.ai;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t.title} />
      {sp.deleted === "history" && <Notice tone="ok">{t.deletedHistory}</Notice>}
      {sp.error === "confirm" && <Notice tone="danger">{t.confirmError}</Notice>}

      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Languages aria-hidden className="h-4 w-4 text-brand" />
            {d.profile.appLanguage}
          </h2>
          <p className="mt-0.5 text-xs text-muted">{d.language.hint}</p>
        </div>
        <LanguageSwitcher />
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 font-semibold">{t.preferences}</h2>
        <ProfileForm>
          <ProfileFields profile={profile} d={d} defaultUiLanguage={lang} />
        </ProfileForm>
      </Card>

      <Card className="p-5 sm:p-6" id="status">
        <h2 className="font-semibold">{t.aiData}</h2>
        <div className="mt-3 rounded-lg border border-line p-3 text-sm">
          <p className="font-semibold">{t.aiProvider}</p>
          <p className="mt-1">
            {ai.kind === "live" ? (
              <>
                <Badge tone="ok">{d.status.aiLive}</Badge> {t.aiLive(ai.model)}
              </>
            ) : ai.kind === "open" ? (
              <>
                <Badge tone="ok">{d.status.aiOpen}</Badge> {t.aiOpen(ai.model, ai.host)}
              </>
            ) : ai.kind === "local" ? (
              <>
                <Badge tone="info">{d.status.aiLocal}</Badge> {t.aiLocal(ai.model, ai.baseUrl)}
              </>
            ) : (
              <>
                <Badge tone="warn">{d.status.aiTemplate}</Badge> {t.aiNone(ai.missing.join(", "))}
              </>
            )}
          </p>
        </div>
        <ul className="mt-3 space-y-2">
          {status.sources.map((s) => {
            const info = SOURCES.find((x) => x.key === s.key)!;
            return (
              <li key={s.key} className="rounded-lg border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{s.name}</span>
                  <Badge tone={STATUS_TONE[s.status as keyof typeof STATUS_TONE]}>{t.sourceStatus[s.status] ?? s.status}</Badge>
                  {s.stale && <Badge tone="warn">{t.stale}</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted">{info.coverage}</p>
                {s.status === "enabled" && (
                  <p className="mt-1 text-xs">
                    {t.lastFetch(s.lastSuccessAt ? formatDateTime(s.lastSuccessAt, lang) : t.never)}
                    {s.lastError ? ` · ${t.lastError} ${s.lastError}` : ""}
                  </p>
                )}
                {s.status !== "enabled" && s.missing.length > 0 && (
                  <p className="mt-1 text-xs">
                    {t.requires} {s.missing.join("; ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold">{t.privacy}</h2>
        <form action={updateConsent} className="mt-3 flex items-start gap-3 text-sm">
          <input id="granted" name="granted" type="checkbox" defaultChecked={consent} className="mt-1 h-4 w-4" />
          <label htmlFor="granted">
            {t.consent}
            <span className="block text-xs text-muted">{t.consentNote}</span>
          </label>
          <Button type="submit" size="sm" variant="secondary">
            {t.update}
          </Button>
        </form>
        <div className="mt-4 text-xs text-muted">
          {t.activity}{" "}
          {Object.keys(counts).length
            ? Object.entries(counts)
                .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
                .join(" · ")
            : t.noActivity}
        </div>
      </Card>

      <Card className="border-danger/40 p-5 sm:p-6">
        <h2 className="font-semibold text-danger">{t.danger}</h2>
        <form action={signOutEverywhere} className="mt-3">
          <Button type="submit" variant="secondary" size="sm">
            <LogOut aria-hidden className="h-3.5 w-3.5" />
            {t.signOutAll}
          </Button>
        </form>
        <form action={deleteMyHistory} className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-sm font-semibold" htmlFor="confirm-history">
              {t.deleteHistory}
            </label>
            <p className="text-xs text-muted">{t.deleteHistoryNote}</p>
            <Input id="confirm-history" name="confirm" placeholder={t.typeDelete} autoComplete="off" className="mt-1" />
          </div>
          <Button type="submit" variant="danger" size="sm">
            {t.deleteHistoryBtn}
          </Button>
        </form>
        <form action={deleteMyAccount} className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-sm font-semibold" htmlFor="confirm-account">
              {t.deleteAccount}
            </label>
            <p className="text-xs text-muted">{t.deleteAccountNote}</p>
            <Input id="confirm-account" name="confirm" placeholder={t.typeDelete} autoComplete="off" className="mt-1" />
          </div>
          <Button type="submit" variant="danger" size="sm">
            {t.deleteAccount}
          </Button>
        </form>
      </Card>
    </div>
  );
}
