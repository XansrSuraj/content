import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { aiStatus } from "@/lib/config";
import { CaptionContextSchema, CaptionResultSchema } from "@/lib/domain/captions";
import { getProfile } from "@/lib/repo/creator";
import { getConversation, listConversations, listMessages } from "@/lib/repo/studio";
import { getBrief } from "@/lib/repo/work";
import { getOpportunity } from "@/lib/repo/discovery";
import { BriefContentSchema } from "@/lib/domain/briefs";
import { hashtagStatusesForMany } from "@/lib/services/captions";
import { toClientMessage, type ClientMessage } from "@/lib/services/serialize";
import { isPlatformId } from "@/lib/domain/platforms";
import { config } from "@/lib/config";
import { Studio } from "./studio";

export const metadata = { title: "Caption Studio" };

export default async function CaptionStudioPage(props: PageProps<"/app/caption-studio">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const db = await getDb();
  const profile = await getProfile(db, user.id);
  const conversations = await listConversations(db, user.id);

  const convId = typeof sp.c === "string" ? sp.c : null;
  const conv = convId ? await getConversation(db, user.id, convId) : null;
  let messages: ClientMessage[] = [];
  if (conv) {
    const ctx = CaptionContextSchema.parse(conv.context);
    const raw = await listMessages(db, user.id, conv.id);
    const parsed = raw.map((m) => {
      const r = m.result ? CaptionResultSchema.safeParse(m.result) : null;
      return r?.success ? r.data : null;
    });
    const statuses = await hashtagStatusesForMany(db, user, parsed, ctx.platform);
    messages = raw.map((m, i) => toClientMessage(m, statuses[i]));
  }

  const baseContext = conv
    ? CaptionContextSchema.parse(conv.context)
    : CaptionContextSchema.parse({
        language: profile?.contentLanguages[0],
        tone: profile?.defaultTone,
        platform: profile?.platforms.find(isPlatformId),
        region: profile?.region,
      });

  // Prefill from an opportunity or a brief, so the journey can continue here.
  let prefill = "";
  let opportunityId: string | null = null;
  if (!conv && typeof sp.opportunity === "string") {
    const opp = await getOpportunity(db, sp.opportunity, user.isDemo && config().demoEnabled ? "any" : "observed");
    if (opp) {
      opportunityId = opp.id;
      const angle = typeof sp.angle === "string" ? opp.angles[Number(sp.angle)] : opp.angles[0];
      prefill = `Video idea: ${opp.title}.${angle ? ` Angle: ${angle.title} — ${angle.description}` : ""}\nIske liye caption aur hashtags do.`;
    }
  }
  if (!conv && typeof sp.brief === "string") {
    const brief = await getBrief(db, user.id, sp.brief);
    const content = brief ? BriefContentSchema.safeParse(brief.content) : null;
    if (brief && content?.success) {
      opportunityId = brief.opportunityId;
      if (isPlatformId(brief.platform)) baseContext.platform = brief.platform;
      prefill = `Video: ${brief.topic}\nAngle: ${content.data.originalAngle}\nHook: ${content.data.hooks[0] ?? ""}\nIske liye caption aur hashtags do.`;
    }
  }

  if (!conv && !prefill && typeof sp.topic === "string" && sp.topic.trim()) {
    // Names the trend and leaves the creator's own angle to fill in — a bare trend word gives the model nothing real to say.
    prefill = `Trend: ${sp.topic.trim().slice(0, 200)}\nMera video: `;
  }

  const ai = aiStatus();

  return (
    <Studio
      key={conv?.id ?? "new"}
      conversations={conversations.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString(), isExample: c.isExample }))}
      conversationId={conv?.id ?? null}
      initialMessages={messages}
      initialContext={baseContext}
      prefill={prefill}
      opportunityId={opportunityId}
      ai={ai.kind === "live" || ai.kind === "open" ? { kind: "live" } : ai.kind === "local" ? { kind: "local", model: ai.model } : { kind: "none", missing: ai.missing, note: ai.note }}
      uiLanguage={profile?.uiLanguage ?? "hinglish"}
      isDemo={user.isDemo}
    />
  );
}
