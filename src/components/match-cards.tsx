import { PenLine } from "lucide-react";
import type { MatchSnapshot } from "@/lib/db/schema";
import { MatchLine } from "@/app/app/caption-studio/sports-panel";
import { Card, LinkButton } from "@/components/ui";

/** Fixture cards with a one-click caption link (Trending page and Home). */
export function MatchCards({ matches, captionLabel }: { matches: MatchSnapshot[]; captionLabel: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {matches.map((m) => (
        <Card key={m.id} className="flex flex-col p-4">
          <MatchLine m={m} />
          <div className="mt-auto pt-3">
            <LinkButton href={`/app/caption-studio?topic=${encodeURIComponent(`${m.homeName} vs ${m.awayName}`)}`} size="sm">
              <PenLine aria-hidden className="h-3.5 w-3.5" />
              {captionLabel}
            </LinkButton>
          </div>
        </Card>
      ))}
    </div>
  );
}
