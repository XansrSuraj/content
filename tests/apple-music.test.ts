import { afterEach, describe, expect, it, vi } from "vitest";
import { AppleMusicTopConnector } from "@/lib/providers/trends/apple-music";
import { SourceFetchError } from "@/lib/providers/trends/types";
import { runIngestion } from "@/lib/jobs/ingest";
import { latestBatch } from "@/lib/services/trend-context";
import { createTestDb } from "./helpers";

const now = new Date("2026-10-20T12:30:00Z");
const FEED = {
  feed: {
    updated: "Tue, 20 Oct 2026 11:32:18 +0000",
    results: [
      { id: "1", name: "Song One", artistName: "Artist A", url: "https://music.apple.com/in/song/1" },
      { id: "2", name: "दूसरा गाना", artistName: "Artist B", url: "https://music.apple.com/in/song/2" },
    ],
  },
};

afterEach(() => vi.unstubAllGlobals());

function stubFetch(body: unknown, status = 200) {
  const fn = vi.fn<(url: string | URL | Request) => Promise<Response>>(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("Apple Music India chart", () => {
  it("maps songs in chart order with an honest coverage note", async () => {
    const fetchFn = stubFetch(FEED);
    const rows = await new AppleMusicTopConnector("UA").fetch(AbortSignal.timeout(1000), now);
    expect(String(fetchFn.mock.calls[0][0])).toContain("/in/music/most-played/50/songs.json");
    expect(rows.map((r) => [r.rank, r.title])).toEqual([
      [1, "Song One — Artist A"],
      [2, "दूसरा गाना — Artist B"],
    ]);
    expect(rows[0].observedAt.toISOString()).toBe("2026-10-20T11:32:18.000Z");
    expect(rows[0].coverageNote).toMatch(/not Instagram Reels or YouTube Shorts/);
    expect(rows[0].hashtags).toEqual([]);
  });

  it("rejects an unexpected shape and treats 5xx as retryable", async () => {
    stubFetch({ nope: true });
    await expect(new AppleMusicTopConnector("UA").fetch(AbortSignal.timeout(1000), now)).rejects.toBeInstanceOf(SourceFetchError);
    stubFetch({}, 503);
    await expect(new AppleMusicTopConnector("UA").fetch(AbortSignal.timeout(1000), now)).rejects.toMatchObject({ retryable: true });
  });

  it("stores a batch that latestBatch returns in order", async () => {
    const db = await createTestDb();
    stubFetch(FEED);
    const res = await runIngestion(db, new AppleMusicTopConnector("UA"), { trigger: "test", now });
    expect(res).toMatchObject({ status: "success", itemsNew: 2 });
    const songs = await latestBatch(db, "apple_music_top_in");
    expect(songs.map((s) => s.title)).toEqual(["Song One — Artist A", "दूसरा गाना — Artist B"]);
  });
});
