import { afterEach, describe, expect, it, vi } from "vitest";
import { YouTubeMostPopularConnector } from "@/lib/providers/trends/youtube";

const now = new Date("2026-10-21T06:00:00Z");
const video = (id: string, title: string, categoryId: string) => ({ id, snippet: { title, description: "#ISL", channelTitle: "c", categoryId } });

afterEach(() => vi.unstubAllGlobals());

describe("YouTube sports chart", () => {
  it("asks for the Sports category and keeps only sports videos at their real chart position", async () => {
    const fetchFn = vi.fn<(url: string | URL | Request) => Promise<Response>>(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              video("a", "NorthEast United FC vs Kerala Blasters FC | Full replay", "17"),
              video("b", "Breaking news live", "25"),
              video("c", "Who can name a footballer faster?", "17"),
              video("d", "Volleyball trick #shorts", "24"),
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchFn);
    const rows = await new YouTubeMostPopularConnector("KEY").fetch(AbortSignal.timeout(1000), now);
    const url = new URL(String(fetchFn.mock.calls[0][0]));
    expect(url.searchParams.get("videoCategoryId")).toBe("17");
    expect(url.searchParams.get("chart")).toBe("mostPopular");
    expect(rows.map((r) => [r.externalId, r.rank])).toEqual([
      ["a", 1],
      ["c", 3],
    ]);
    expect(rows[0].coverageNote).toMatch(/Sports category/);
  });
});
