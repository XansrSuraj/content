import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { aiStatus, config } from "@/lib/config";
import { isPlatformId } from "@/lib/domain/platforms";
import { getProfile } from "@/lib/repo/creator";
import { getOpportunity } from "@/lib/repo/discovery";
import { getServerDict } from "@/lib/i18n/server";
import { Notice, PageHeader } from "@/components/ui";
import { BriefForm } from "./brief-form";

export async function generateMetadata() {
  const { d } = await getServerDict();
  return { title: d.briefs.newTitle };
}

export default async function NewBriefPage(props: PageProps<"/app/briefs/new">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const db = await getDb();
  const [profile, { d }] = await Promise.all([getProfile(db, user.id), getServerDict()]);
  const t = d.briefs;
  const opp =
    typeof sp.opportunity === "string"
      ? await getOpportunity(db, sp.opportunity, user.isDemo && config().demoEnabled ? "any" : "observed")
      : null;
  const angleIdx = typeof sp.angle === "string" ? Number(sp.angle) : -1;
  const angle = opp && angleIdx >= 0 ? opp.angles[angleIdx] : undefined;
  const ai = aiStatus();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t.newTitle} subtitle={t.newLead} />
      {ai.kind === "local" ? (
        <Notice tone="info" title={t.localTitle} className="mb-4">
          {t.localText(ai.model)}
        </Notice>
      ) : ai.kind === "not_configured" ? (
        <Notice tone="warn" title={t.noAiTitle} className="mb-4">
          {t.noAiText}
        </Notice>
      ) : null}
      {opp?.isDemo && (
        <Notice tone="demo" className="mb-4">
          {t.demoBased}
        </Notice>
      )}
      <BriefForm
        defaults={{
          topic: opp ? opp.title : typeof sp.topic === "string" ? sp.topic.slice(0, 200) : "",
          opportunityId: opp?.id ?? "",
          angle: angle ? `${angle.title} — ${angle.description}` : "",
          platform: opp?.platforms.find((p) => profile?.platforms.includes(p)) ?? profile?.platforms.find(isPlatformId) ?? "instagram_reels",
          language: profile?.contentLanguages[0] ?? "hinglish",
          tone: profile?.defaultTone ?? "conversational",
          personalExample: "",
        }}
      />
    </div>
  );
}
