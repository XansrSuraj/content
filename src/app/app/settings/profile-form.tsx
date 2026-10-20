"use client";

import { useActionState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { updateProfile, type ProfileState } from "@/app/actions/profile";
import { useI18n } from "@/components/i18n-provider";
import { Button, Notice } from "@/components/ui";

export function ProfileForm({ children }: { children: ReactNode }) {
  const { d } = useI18n();
  const router = useRouter();
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfile, {});
  // If the app language changed in this form, re-render everything in the new language.
  useEffect(() => {
    if (state.saved) router.refresh();
  }, [state, router]);
  return (
    <form action={action}>
      {children}
      {state.error && (
        <Notice tone="danger" className="mt-4">
          {state.error}
        </Notice>
      )}
      {state.saved && (
        <Notice tone="ok" className="mt-4">
          {d.profile.savedPrefs}
        </Notice>
      )}
      <Button type="submit" className="mt-5" disabled={pending}>
        {pending ? d.common.saving : d.profile.savePrefs}
      </Button>
    </form>
  );
}
