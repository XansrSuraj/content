import Link from "next/link";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { getCurrentUser } from "@/lib/auth/session";
import { startDemo } from "@/app/actions/auth";
import { Button, Card, Notice } from "@/components/ui";
import { AuthForm } from "./auth-form";

export const metadata = { title: "Sign in" };

export default async function SignInPage(props: PageProps<"/signin">) {
  const sp = await props.searchParams;
  if (await getCurrentUser()) redirect("/app");
  const demo = config().demoEnabled;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-lg font-bold">
        Trend<span className="text-brand">Saathi</span>
      </Link>
      <Card className="p-5 sm:p-6">
        <AuthForm initialMode={sp.mode === "signup" ? "signup" : "signin"} />
      </Card>
      {sp.demo === "unavailable" && (
        <Notice tone="warn" className="mt-4">
          Demo mode is turned off on this server.
        </Notice>
      )}
      {sp.error === "rate" && (
        <Notice tone="warn" className="mt-4">
          Too many attempts. Please wait a few minutes.
        </Notice>
      )}
      {demo && (
        <Card className="mt-4 p-5">
          <p className="font-semibold">Bas dekhna hai?</p>
          <p className="mt-1 text-sm text-muted">
            Try a private demo account with clearly labeled sample data. Demo accounts expire after a couple of days.
          </p>
          <form action={startDemo} className="mt-3">
            <Button type="submit" variant="secondary" className="w-full">
              Try the demo
            </Button>
          </form>
        </Card>
      )}
    </main>
  );
}
