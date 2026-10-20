"use client";

import { createContext, useContext, type ReactNode } from "react";
import { getDict, type Dict, type Lang } from "@/lib/i18n";

const I18nContext = createContext<{ lang: Lang; d: Dict } | null>(null);

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <I18nContext value={{ lang, d: getDict(lang) }}>{children}</I18nContext>;
}

/** UI strings for client components. */
export function useI18n(): { lang: Lang; d: Dict } {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
