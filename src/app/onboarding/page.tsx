import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/repo/creator";
import { getServerDict } from "@/lib/i18n/server";
import { skipOnboarding } from "@/app/actions/profile";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { Badge, Button, Card } from "@/components/ui";
import { ProfileFields } from "@/components/profile-fields";
import { OnboardingSubmit } from "./submit";

export async function generateMetadata() {
  const { d } = await getServerDict();
  return { title: d.onboarding.title };
}

export default async function OnboardingPage(props: PageProps<"/onboarding">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const { lang, d } = await getServerDict();
  const db = await getDb();
  const profile = await getProfile(db, user.id);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Logo href="/app" />
          {user.isDemo && <Badge tone="accent">{d.nav.demoAccount}</Badge>}
        </div>
        <LanguageSwitcher compact />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">{d.onboarding.title}</h1>
      <p className="mt-1 text-sm text-muted">
        {d.onboarding.lead}
        {sp.demo ? d.onboarding.demoLead : ""}
      </p>
      <Card className="mt-6 p-5 shadow-sm sm:p-6">
        <OnboardingSubmit>
          {/* Pre-select the language the visitor is already using. */}
          <ProfileFields profile={profile} d={d} defaultUiLanguage={lang} />
        </OnboardingSubmit>
      </Card>
      <form action={skipOnboarding} className="mt-4 text-center">
        <Button type="submit" variant="ghost" size="sm">
          {d.onboarding.skip}
        </Button>
      </form>
    </main>
  );
}
