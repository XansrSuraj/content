import Link from "next/link";
import { Plus } from "lucide-react";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { getPlatform } from "@/lib/domain/platforms";
import { listBriefs } from "@/lib/repo/work";
import { getServerDict } from "@/lib/i18n/server";
import { Badge, Card, EmptyState, LinkButton, ModeBadge, PageHeader, formatDate } from "@/components/ui";

export async function generateMetadata() {
  const { d } = await getServerDict();
  return { title: d.briefs.title };
}

export default async function BriefsPage() {
  const user = await requireUser();
  const db = await getDb();
  const [briefs, { lang, d }] = await Promise.all([listBriefs(db, user.id), getServerDict()]);
  const t = d.briefs;
  return (
    <div>
      <PageHeader
        title={t.title}
        subtitle={t.lead}
        actions={
          <LinkButton href="/app/briefs/new">
            <Plus aria-hidden className="h-4 w-4" />
            {t.new}
          </LinkButton>
        }
      />
      {briefs.length === 0 ? (
        <EmptyState title={t.emptyTitle} action={<LinkButton href="/app/briefs/new">{t.createFirst}</LinkButton>}>
          {t.emptyText}
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {briefs.map((b) => (
            <Card key={b.id} className="p-5 transition-shadow hover:shadow-sm">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="brand">{getPlatform(b.platform).label}</Badge>
                <ModeBadge mode={b.mode} label={d.modes[b.mode]} />
                {b.edited && <Badge>{t.edited}</Badge>}
              </div>
              <Link href={`/app/briefs/${b.id}`} className="mt-2.5 block font-semibold hover:underline">
                {b.topic}
              </Link>
              <p className="mt-0.5 text-xs text-muted">{formatDate(b.createdAt, lang)}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
