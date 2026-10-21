import { CalendarRange, PenLine } from "lucide-react";
import type { MatchSnapshot } from "@/lib/db/schema";
import { MatchLine } from "@/app/app/caption-studio/sports-panel";
import { Card, LinkButton } from "@/components/ui";

/** Fixture cards: open the match's content plan, or write a caption for it straight away (Match Center and Home). */
export function MatchCards({ matches, planLabel, captionLabel }: { matches: MatchSnapshot[]; planLabel: string; captionLabel: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {matches.map((m) => (
        <Card key={m.id} className="relative flex flex-col p-4 transition-shadow hover:shadow-sm">
          <MatchLine m={m} />
          <div className="mt-auto flex flex-wrap gap-2 pt-3">
            <LinkButton href={`/app/matches/${m.id}`} size="sm">
              <CalendarRange aria-hidden className="h-3.5 w-3.5" />
              {planLabel}
            </LinkButton>
            <LinkButton href={`/app/caption-studio?match=${m.id}&step=preview`} size="sm" variant="secondary">
              <PenLine aria-hidden className="h-3.5 w-3.5" />
              {captionLabel}
            </LinkButton>
          </div>
        </Card>
      ))}
    </div>
  );
}
