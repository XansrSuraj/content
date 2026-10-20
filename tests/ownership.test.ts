import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser } from "./helpers";
import type { DB } from "@/lib/db/client";
import { DEFAULT_CONTEXT } from "@/lib/domain/captions";
import {
  addMessage,
  createConversation,
  deleteConversation,
  deleteVariant,
  getConversation,
  getVariant,
  listConversations,
  listMessages,
  saveVariant,
  updateConversation,
  updateVariant,
} from "@/lib/repo/studio";
import {
  addPublished,
  createBrief,
  deleteBrief,
  deletePublished,
  getBrief,
  listBriefs,
  listPublished,
  listSaved,
  saveItem,
  unsaveItem,
  updateBrief,
  updatePublished,
} from "@/lib/repo/work";
import { addFeedback, deleteAccount, deleteHistory, getProfile, listFeedback, upsertProfile } from "@/lib/repo/creator";
import type { BriefContent } from "@/lib/domain/briefs";

const brief: BriefContent = {
  originalAngle: "x",
  intendedAudience: "y",
  hooks: ["h"],
  openingShot: "s",
  beats: [{ beat: "b", detail: "d" }],
  callToAction: "c",
  titleOptions: [],
  hashtags: [],
  factsToVerify: [],
  lowEffortVersion: "l",
  platformNotes: [],
  assumptions: [],
  sourceRefs: [],
};

describe("ownership isolation", () => {
  let db: DB;
  let alice: { id: string };
  let bob: { id: string };

  beforeAll(async () => {
    db = await createTestDb();
    alice = await createUser(db, "alice@example.com");
    bob = await createUser(db, "bob@example.com");
  });

  it("conversations and messages are private to the owner", async () => {
    const conv = await createConversation(db, alice.id, { title: "Alice caption", context: DEFAULT_CONTEXT });
    await addMessage(db, alice.id, conv.id, { role: "user", text: "secret caption" });

    expect(await getConversation(db, bob.id, conv.id)).toBeNull();
    expect(await listMessages(db, bob.id, conv.id)).toEqual([]);
    expect(await addMessage(db, bob.id, conv.id, { role: "user", text: "injected" })).toBeNull();
    expect(await updateConversation(db, bob.id, conv.id, { title: "pwned" })).toBeNull();
    expect(await deleteConversation(db, bob.id, conv.id)).toBe(false);
    expect((await listConversations(db, bob.id)).length).toBe(0);

    const still = await getConversation(db, alice.id, conv.id);
    expect(still?.title).toBe("Alice caption");
    expect((await listMessages(db, alice.id, conv.id)).map((m) => m.text)).toEqual(["secret caption"]);
  });

  it("caption variants cannot be read, edited, deleted or attached across users", async () => {
    const conv = await createConversation(db, alice.id, { title: "c", context: DEFAULT_CONTEXT });
    const v = await saveVariant(db, alice.id, {
      conversationId: conv.id,
      messageId: null,
      platform: "instagram_reels",
      label: "A",
      originalText: "orig",
      text: "orig",
      hashtags: ["#a"],
    });
    expect(v).not.toBeNull();
    expect(await getVariant(db, bob.id, v!.id)).toBeNull();
    expect(await updateVariant(db, bob.id, v!.id, { text: "changed" })).toBeNull();
    expect(await deleteVariant(db, bob.id, v!.id)).toBe(false);
    // Bob cannot save a variant into Alice's conversation.
    expect(
      await saveVariant(db, bob.id, {
        conversationId: conv.id,
        messageId: null,
        platform: "instagram_reels",
        label: "A",
        originalText: "x",
        text: "x",
        hashtags: [],
      }),
    ).toBeNull();
    expect((await getVariant(db, alice.id, v!.id))?.text).toBe("orig");
  });

  it("briefs, saved items, published posts and feedback are owner-scoped", async () => {
    const b = await createBrief(db, alice.id, { opportunityId: null, topic: "t", platform: "youtube", content: brief, mode: "template_preview" });
    expect(await getBrief(db, bob.id, b.id)).toBeNull();
    expect(await updateBrief(db, bob.id, b.id, brief)).toBeNull();
    expect(await deleteBrief(db, bob.id, b.id)).toBe(false);
    expect(await listBriefs(db, bob.id)).toEqual([]);

    await saveItem(db, alice.id, "brief", b.id);
    expect(await listSaved(db, bob.id)).toEqual([]);
    expect(await unsaveItem(db, bob.id, "brief", b.id)).toBe(false);
    expect((await listSaved(db, alice.id)).length).toBe(1);

    const p = await addPublished(db, alice.id, { platform: "youtube", url: "https://youtu.be/x", publishedAt: new Date() });
    expect(await listPublished(db, bob.id)).toEqual([]);
    expect(await updatePublished(db, bob.id, p.id, { notes: "x" })).toBeNull();
    expect(await deletePublished(db, bob.id, p.id)).toBe(false);

    await addFeedback(db, alice.id, { targetType: "brief", targetId: b.id, verdict: "useful", reason: "" });
    expect(await listFeedback(db, bob.id)).toEqual([]);
  });

  it("deleting history removes only the owner's records; deleting account cascades", async () => {
    const carol = await createUser(db, "carol@example.com");
    await upsertProfile(db, carol.id, { displayName: "Carol" });
    await createConversation(db, carol.id, { title: "c", context: DEFAULT_CONTEXT });
    const aliceBefore = (await listConversations(db, alice.id)).length;

    await deleteHistory(db, carol.id);
    expect(await listConversations(db, carol.id)).toEqual([]);
    expect((await listConversations(db, alice.id)).length).toBe(aliceBefore);
    expect((await getProfile(db, carol.id))?.displayName).toBe("Carol");

    await deleteAccount(db, carol.id);
    expect(await getProfile(db, carol.id)).toBeNull();
  });
});
