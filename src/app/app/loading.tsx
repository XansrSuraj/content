import { getServerDict } from "@/lib/i18n/server";

export default async function Loading() {
  const { d } = await getServerDict();
  return (
    <div role="status" aria-label={d.common.loading} className="space-y-3">
      <div className="h-7 w-48 animate-pulse rounded bg-surface-2" />
      <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
      <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
    </div>
  );
}
