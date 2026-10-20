export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      <div className="h-7 w-48 animate-pulse rounded bg-surface-2" />
      <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
      <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
    </div>
  );
}
