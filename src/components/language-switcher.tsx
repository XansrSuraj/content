"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { setLanguage } from "@/app/actions/language";
import { LANGS, getDict, type Lang } from "@/lib/i18n";
import { useI18n } from "./i18n-provider";
import { cx } from "./ui";

/** Three-way language switch (English · Hinglish · हिन्दी). Applies instantly and is remembered. */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, d } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  function choose(next: Lang) {
    if (next === lang) return;
    start(async () => {
      await setLanguage(next);
      router.refresh();
    });
  }

  if (compact) {
    return (
      <label className="relative inline-flex items-center gap-1 text-sm">
        <Languages aria-hidden className="pointer-events-none absolute left-2 h-4 w-4 text-muted" />
        <span className="sr-only">{d.language.switchTo}</span>
        <select
          value={lang}
          disabled={pending}
          onChange={(e) => choose(e.target.value as Lang)}
          className="h-8 appearance-none rounded-lg border border-line bg-surface pl-7 pr-2 text-sm text-fg hover:bg-surface-2 disabled:opacity-60"
        >
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {getDict(l).langName}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div role="radiogroup" aria-label={d.language.switchTo} className={cx("inline-flex rounded-lg border border-line bg-surface p-0.5", pending && "opacity-60")}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={l === lang}
          disabled={pending}
          onClick={() => choose(l)}
          className={cx(
            "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
            l === lang ? "bg-brand text-brand-fg" : "text-muted hover:text-fg",
          )}
        >
          {getDict(l).langName}
        </button>
      ))}
    </div>
  );
}
