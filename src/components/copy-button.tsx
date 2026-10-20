"use client";

import { useState } from "react";
import { buttonClass } from "./ui";

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
        {state === "ok" ? "Copied ✓" : label}
      </button>
      <span aria-live="polite" className="text-xs text-danger">
        {state === "fail" ? "Copy failed — select the text and copy manually." : ""}
      </span>
    </span>
  );
}
