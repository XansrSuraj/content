"use client";

import { Button } from "@/components/ui";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-bold">Kuch gadbad ho gayi</h1>
      <p className="mt-2 text-sm text-muted">Something went wrong loading this page. Your saved work is not affected.</p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
