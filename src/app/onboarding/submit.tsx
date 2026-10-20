"use client";

import { useActionState, type ReactNode } from "react";
import { completeOnboarding, type ProfileState } from "@/app/actions/profile";
import { useI18n } from "@/components/i18n-provider";
import { Button, Notice } from "@/components/ui";

export function OnboardingSubmit({ children }: { children: ReactNode }) {
  const { d } = useI18n();
  const [state, action, pending] = useActionState<ProfileState, FormData>(completeOnboarding, {});
  return (
    <form action={action}>
      {children}
      {state.error && (
        <Notice tone="danger" className="mt-4">
          {state.error}
        </Notice>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        <Button type="submit" name="next" value="app" disabled={pending}>
          {d.onboarding.saveIdeas}
        </Button>
        <Button type="submit" name="next" value="studio" variant="secondary" disabled={pending}>
          {d.onboarding.saveStudio}
        </Button>
      </div>
    </form>
  );
}
