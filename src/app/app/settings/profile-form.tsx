"use client";

import { useActionState, type ReactNode } from "react";
import { updateProfile, type ProfileState } from "@/app/actions/profile";
import { Button, Notice } from "@/components/ui";

export function ProfileForm({ children }: { children: ReactNode }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfile, {});
  return (
    <form action={action}>
      {children}
      {state.error && <Notice tone="danger" className="mt-4">{state.error}</Notice>}
      {state.saved && <Notice tone="ok" className="mt-4">Preferences saved.</Notice>}
      <Button type="submit" className="mt-5" disabled={pending}>
        {pending ? "Saving…" : "Save preferences"}
      </Button>
    </form>
  );
}
