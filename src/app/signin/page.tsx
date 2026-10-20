import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { getCurrentUser } from "@/lib/auth/session";
import { getServerDict } from "@/lib/i18n/server";
import { startDemo } from "@/app/actions/auth";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { Button, Card, Notice } from "@/components/ui";
import { AuthForm } from "./auth-form";

export async function generateMetadata() {
  const { d } = await getServerDict();
  return { title: d.auth.signIn };
}

export default async function SignInPage(props: PageProps<"/signin">) {
  const sp = await props.searchParams;
  if (await getCurrentUser()) redirect("/app");
  const { d } = await getServerDict();
  const demo = config().demoEnabled;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Logo />
        <LanguageSwitcher compact />
      </div>
      <Card className="p-5 shadow-sm sm:p-6">
        <AuthForm initialMode={sp.mode === "signup" ? "signup" : "signin"} />
      </Card>
      {sp.demo === "unavailable" && (
        <Notice tone="warn" className="mt-4">
          {d.auth.demoUnavailable}
        </Notice>
      )}
      {sp.error === "rate" && (
        <Notice tone="warn" className="mt-4">
          {d.auth.rateLimited}
        </Notice>
      )}
      {demo && (
        <Card className="mt-4 p-5">
          <p className="font-semibold">{d.auth.demoTitle}</p>
          <p className="mt-1 text-sm text-muted">{d.auth.demoText}</p>
          <form action={startDemo} className="mt-3">
            <Button type="submit" variant="secondary" className="w-full">
              {d.landing.tryDemo}
            </Button>
          </form>
        </Card>
      )}
    </main>
  );
}
