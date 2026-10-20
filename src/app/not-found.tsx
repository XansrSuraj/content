import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold">Ye page nahi mila</h1>
      <p className="mt-2 text-sm text-muted">It may have been deleted, or it belongs to another account.</p>
      <LinkButton href="/app" className="mt-4">
        Go to app
      </LinkButton>
    </main>
  );
}
