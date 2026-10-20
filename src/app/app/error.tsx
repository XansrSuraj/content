"use client";

import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const { d } = useI18n();
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-bold">{d.appError.title}</h1>
      <p className="mt-2 text-sm text-muted">{d.appError.text}</p>
      <Button className="mt-4" onClick={reset}>
        {d.common.tryAgain}
      </Button>
    </div>
  );
}
