"use client";

import { useActionState, type ReactNode } from "react";
import { completeOnboarding, type ProfileState } from "@/app/actions/profile";
import { Button, Notice } from "@/components/ui";

export function OnboardingSubmit({ children }: { children: ReactNode }) {
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
          Save & see ideas
        </Button>
        <Button type="submit" name="next" value="studio" variant="secondary" disabled={pending}>
          Save & open Caption Studio
        </Button>
      </div>
    </form>
  );
}
