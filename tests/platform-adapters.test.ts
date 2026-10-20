import { describe, expect, it } from "vitest";
import { ADAPTERS, wordingLabel } from "@/lib/domain/platform-adapters";

describe("platform adapters", () => {
  it("YouTube has title + description with official limits; Instagram has a caption", () => {
    expect(ADAPTERS.youtube.fields).toEqual(["title", "description"]);
    expect(ADAPTERS.youtube_shorts.limits.title).toMatchObject({ max: 100, status: "official" });
    expect(ADAPTERS.youtube.limits.description).toMatchObject({ max: 5000, status: "official" });
    expect(ADAPTERS.instagram_reels.fields).toEqual(["caption"]);
    expect(ADAPTERS.instagram_reels.limits.caption).toMatchObject({ max: 2200, status: "official" });
    expect(ADAPTERS.tiktok.limits.caption?.status).toBe("unverified");
  });
  it("forbids other platforms' wording", () => {
    expect(ADAPTERS.youtube.forbiddenWording.some((r) => r.test("Save this Reel!"))).toBe(true);
    expect(ADAPTERS.instagram_reels.forbiddenWording.some((r) => r.test("Subscribe for more"))).toBe(true);
    expect(ADAPTERS.youtube.forbiddenWording.some((r) => r.test("Subscribe for more"))).toBe(false);
  });
  it("turns patterns into readable labels", () => {
    expect(ADAPTERS.youtube.forbiddenWording.map(wordingLabel)).toEqual(["reel", "swipe up", "link in bio", "save this reel / post", "story … swipe"]);
  });
});
