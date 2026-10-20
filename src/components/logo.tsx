import Link from "next/link";
import { TrendingUp } from "lucide-react";

export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2 text-lg font-bold tracking-tight">
      <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-brand-fg">
        <TrendingUp className="h-4 w-4" />
      </span>
      <span className={compact ? "sr-only sm:not-sr-only" : undefined}>
        Trend<span className="text-brand">Saathi</span>
      </span>
    </Link>
  );
}
