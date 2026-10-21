import { describe, expect, it } from "vitest";
import { isSportsTopic } from "@/lib/domain/sports/intent";
import { needsReview } from "@/lib/providers/trends/filters";

describe("isSportsTopic (trend titles)", () => {
  it.each([
    "Virat Kohli",
    "India vs Australia",
    "ind vs aus",
    "IPL 2027 auction",
    "Real Madrid CF",
    "Lionel Messi",
    "UEFA Champions League",
    "Pro Kabaddi League",
    "Neeraj Chopra javelin",
    "Ranji Trophy",
    "2026 Asian Para Games medal table",
    "क्रिकेट",
  ])("sports: %s", (title) => expect(isSportsTopic(title)).toBe(true));

  it.each([
    "India",
    "Six killed in road accident",
    "Diwali 2026",
    "iPhone 18 price",
    "Real estate prices",
    "City lights",
    "Stock market today",
    "Bigg Boss",
    "माही विज",
    "Modern Wisdom — Chris Williamson",
  ])("not sports: %s", (title) => expect(isSportsTopic(title)).toBe(false));
});

describe("safety filter vs sports terms", () => {
  it.each(["NorthEast United FC vs Kerala Blasters FC | ISL", "Bumrah in the death overs", "Dead rubber in Ranchi", "Best attacking midfielders", "Penalty shooting drills"])(
    "not an event: %s",
    (t) => expect(needsReview(t)).toBe(false),
  );
  it.each(["Bomb blast in city", "Stadium stampede", "Terror attack", "Player died in accident"])("event: %s", (t) => expect(needsReview(t)).toBe(true));
});
