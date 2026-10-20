"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "@/app/actions/auth";
import { useI18n } from "@/components/i18n-provider";
import { Button, Field, Input, Notice, cx } from "@/components/ui";

export function AuthForm({ initialMode }: { initialMode: "signin" | "signup" }) {
  const { d } = useI18n();
  const [mode, setMode] = useState(initialMode);
  const [inState, inAction, inPending] = useActionState<AuthState, FormData>(signIn, {});
  const [upState, upAction, upPending] = useActionState<AuthState, FormData>(signUp, {});
  const state = mode === "signin" ? inState : upState;
  const pending = mode === "signin" ? inPending : upPending;

  return (
    <div>
      <div role="tablist" aria-label="Account" className="mb-5 grid grid-cols-2 rounded-lg bg-surface-2 p-1 text-sm font-semibold">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cx("rounded-md py-2 transition-colors", mode === m ? "bg-surface shadow-sm" : "text-muted hover:text-fg")}
          >
            {m === "signin" ? d.auth.signIn : d.auth.createAccount}
          </button>
        ))}
      </div>
      <form action={mode === "signin" ? inAction : upAction} className="flex flex-col gap-4">
        <Field label={d.auth.email} htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label={d.auth.password} htmlFor="password" hint={mode === "signup" ? d.auth.passwordHint : undefined}>
          <Input id="password" name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={10} required />
        </Field>
        {state.error && <Notice tone="danger">{state.error}</Notice>}
        <Button type="submit" disabled={pending} data-testid="auth-submit">
          {pending ? d.common.pleaseWait : mode === "signin" ? d.auth.signIn : d.auth.createAccount}
        </Button>
      </form>
    </div>
  );
}
