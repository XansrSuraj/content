import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { getPlatform } from "@/lib/domain/platforms";
import { listBriefs } from "@/lib/repo/work";
import { Badge, ModeBadge, Card, EmptyState, LinkButton, PageHeader, formatDate } from "@/components/ui";

export const metadata = { title: "Briefs" };

export default async function BriefsPage() {
  const user = await requireUser();
  const db = await getDb();
  const briefs = await listBriefs(db, user.id);
  return (
    <div>
      <PageHeader
        title="Content briefs"
        subtitle="Shootable plans: angle, hooks, opening shot, beats, CTA, and facts to verify."
        actions={<LinkButton href="/app/briefs/new">New brief</LinkButton>}
      />
      {briefs.length === 0 ? (
        <EmptyState title="Abhi koi brief nahi" action={<LinkButton href="/app/briefs/new">Create your first brief</LinkButton>}>
          Start from an opportunity or any topic of your own.
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {briefs.map((b) => (
            <Card key={b.id} className="p-4">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="brand">{getPlatform(b.platform).label}</Badge>
                <ModeBadge mode={b.mode} />
                {b.edited && <Badge>Edited</Badge>}
              </div>
              <Link href={`/app/briefs/${b.id}`} className="mt-2 block font-semibold hover:underline">
                {b.topic}
              </Link>
              <p className="text-xs text-muted">{formatDate(b.createdAt)}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
