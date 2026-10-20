"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonClass } from "./ui";
import { useI18n } from "./i18n-provider";

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

/** Shows "Copied" only when the browser confirms the copy succeeded. */
export function CopyButton({
  text,
  label,
  size = "sm",
  variant = "secondary",
  onCopied,
}: {
  text: string;
  label: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "ghost";
  onCopied?: () => void;
}) {
  const { d } = useI18n();
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={!text}
        className={buttonClass(variant, size)}
        onClick={async () => {
          const ok = await writeClipboard(text);
          setState(ok ? "ok" : "fail");
          if (ok) onCopied?.();
          setTimeout(() => setState("idle"), 2200);
        }}
      >
        {state === "ok" ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
        {state === "ok" ? d.copyBtn.copied : label}
      </button>
      <span aria-live="polite" className="text-xs text-danger">
        {state === "fail" ? d.common.copyFailed : ""}
      </span>
    </span>
  );
}
