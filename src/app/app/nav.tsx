"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, FileText, House, Lightbulb, PenLine, Send, Settings, Shield, TrendingUp, type LucideIcon } from "lucide-react";
import { cx } from "@/components/ui";

export type NavIcon = "home" | "studio" | "trending" | "ideas" | "briefs" | "saved" | "published" | "settings" | "admin";

const ICONS: Record<NavIcon, LucideIcon> = {
  home: House,
  studio: PenLine,
  trending: TrendingUp,
  ideas: Lightbulb,
  briefs: FileText,
  saved: Bookmark,
  published: Send,
  settings: Settings,
  admin: Shield,
};

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the mobile tab bar. */
  short?: string;
  icon: NavIcon;
  mobile?: boolean;
}

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map((i) => {
        const Icon = ICONS[i.icon];
        const active = isActive(pathname, i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-brand-soft text-brand-ink" : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon aria-hidden className="h-4 w-4 shrink-0" strokeWidth={active ? 2.25 : 2} />
            <span className="truncate">{i.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const mobile = items.filter((i) => i.mobile);
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      style={{ gridTemplateColumns: `repeat(${mobile.length}, minmax(0, 1fr))` }}
    >
      {mobile.map((i) => {
        const Icon = ICONS[i.icon];
        const active = isActive(pathname, i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cx("flex flex-col items-center gap-1 py-2 text-[11px] font-medium", active ? "text-brand" : "text-muted")}
          >
            <Icon aria-hidden className="h-5 w-5" strokeWidth={active ? 2.25 : 2} />
            <span className="max-w-full truncate px-1">{i.short ?? i.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
