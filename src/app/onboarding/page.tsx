import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/repo/creator";
import { skipOnboarding } from "@/app/actions/profile";
import { Badge, Button, Card } from "@/components/ui";
import { ProfileFields } from "@/components/profile-fields";
import { OnboardingSubmit } from "./submit";

export const metadata = { title: "Set up" };

export default async function OnboardingPage(props: PageProps<"/onboarding">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const db = await getDb();
  const profile = await getProfile(db, user.id);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <span className="text-lg font-bold">
          Trend<span className="text-brand">Saathi</span>
        </span>
        {user.isDemo && <Badge tone="accent">Demo account</Badge>}
      </div>
      <h1 className="text-2xl font-bold">Thoda apne baare mein batao</h1>
      <p className="mt-1 text-sm text-muted">
        This shapes which ideas you see and how captions are written. Everything is optional and editable later in
        Settings.
        {sp.demo ? " Demo accounts are private to this browser and expire in a couple of days." : ""}
      </p>
      <Card className="mt-6 p-5 sm:p-6">
        <OnboardingSubmit>
          <ProfileFields profile={profile} />
        </OnboardingSubmit>
      </Card>
      <form action={skipOnboarding} className="mt-4 text-center">
        <Button type="submit" variant="ghost" size="sm">
          Skip for now — go straight to Caption Studio
        </Button>
      </form>
    </main>
  );
}
