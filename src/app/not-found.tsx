import { getServerDict } from "@/lib/i18n/server";
import { LinkButton } from "@/components/ui";

export default async function NotFound() {
  const { d } = await getServerDict();
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl font-bold text-brand">404</p>
      <h1 className="mt-2 text-2xl font-bold">{d.notFound.title}</h1>
      <p className="mt-2 text-sm text-muted">{d.notFound.text}</p>
      <LinkButton href="/app" className="mt-5">
        {d.notFound.goApp}
      </LinkButton>
    </main>
  );
}
