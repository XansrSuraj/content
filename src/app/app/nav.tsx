"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  mobile?: boolean;
}

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={isActive(pathname, i.href) ? "page" : undefined}
          className={cx(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
            isActive(pathname, i.href) ? "bg-brand-soft text-brand-ink" : "text-muted hover:bg-surface-2 hover:text-fg",
          )}
        >
          <span aria-hidden className="w-5 text-center">
            {i.icon}
          </span>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const mobile = items.filter((i) => i.mobile);
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      style={{ gridTemplateColumns: `repeat(${mobile.length}, minmax(0, 1fr))` }}
    >
      {mobile.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={isActive(pathname, i.href) ? "page" : undefined}
          className={cx(
            "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
            isActive(pathname, i.href) ? "text-brand" : "text-muted",
          )}
        >
          <span aria-hidden className="text-lg leading-none">
            {i.icon}
          </span>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
