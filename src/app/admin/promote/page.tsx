import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { getObservation } from "@/lib/repo/discovery";
import { SOURCE_NAMES } from "@/lib/providers/trends/catalog";
import { PageHeader, formatDateTime } from "@/components/ui";
import { PromoteForm } from "./promote-form";

export const metadata = { title: "Create opportunity" };

export default async function PromotePage(props: PageProps<"/admin/promote">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const db = await getDb();
  const obs = typeof sp.obs === "string" ? await getObservation(db, sp.obs) : null;
  const usable = obs && !obs.isDemo ? obs : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/admin" className="text-sm text-brand">← Admin</Link>
      <PageHeader
        title="Create an opportunity"
        subtitle="Write the summary, fit and original angles yourself. Evidence confidence is computed from the attached observations, not entered by hand."
      />
      {usable && (
        <p className="mb-4 rounded-lg border border-line bg-surface p-3 text-sm">
          Evidence: <strong>{usable.title}</strong> — {SOURCE_NAMES[usable.sourceKey] ?? usable.sourceKey}, {usable.geo}, observed {formatDateTime(usable.observedAt)}. {usable.coverageNote}
        </p>
      )}
      <PromoteForm observationId={usable?.id ?? null} title={usable?.title ?? ""} />
    </main>
  );
}
