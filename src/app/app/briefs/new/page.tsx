import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { aiStatus, config } from "@/lib/config";
import { isPlatformId } from "@/lib/domain/platforms";
import { getProfile } from "@/lib/repo/creator";
import { getOpportunity } from "@/lib/repo/discovery";
import { Notice, PageHeader } from "@/components/ui";
import { BriefForm } from "./brief-form";

export const metadata = { title: "New brief" };

export default async function NewBriefPage(props: PageProps<"/app/briefs/new">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const db = await getDb();
  const profile = await getProfile(db, user.id);
  const opp =
    typeof sp.opportunity === "string"
      ? await getOpportunity(db, sp.opportunity, user.isDemo && config().demoEnabled ? "any" : "observed")
      : null;
  const angleIdx = typeof sp.angle === "string" ? Number(sp.angle) : -1;
  const angle = opp && angleIdx >= 0 ? opp.angles[angleIdx] : undefined;
  const ai = aiStatus();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New content brief" subtitle="Topic likho — baaki optional hai." />
      {ai.kind === "local" ? (
        <Notice tone="info" title="Local AI (development)" className="mb-4">
          Briefs are written by {ai.model} running on this computer. It can take a minute or two, and quality is lower than the production model.
        </Notice>
      ) : ai.kind === "not_configured" ? (
        <Notice tone="warn" title="AI not configured" className="mb-4">
          You&apos;ll get a labeled template brief with blanks to fill. {ai.note ?? `Set ${ai.missing.join(" and ")} for personalised briefs.`}
        </Notice>
      ) : null}
      {opp?.isDemo && (
        <Notice tone="demo" className="mb-4">
          Based on a demo opportunity. Its evidence is sample data.
        </Notice>
      )}
      <BriefForm
        defaults={{
          topic: opp ? opp.title : typeof sp.topic === "string" ? sp.topic.slice(0, 200) : "",
          opportunityId: opp?.id ?? "",
          angle: angle ? `${angle.title} — ${angle.description}` : "",
          platform: (opp?.platforms.find((p) => profile?.platforms.includes(p)) ?? profile?.platforms.find(isPlatformId) ?? "instagram_reels"),
          language: profile?.contentLanguages[0] ?? "hinglish",
          tone: profile?.defaultTone ?? "conversational",
          personalExample: "",
        }}
      />
    </div>
  );
}
