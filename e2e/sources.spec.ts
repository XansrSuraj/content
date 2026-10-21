import { test, expect } from "./fixtures";
test("Trending is sports-only (matches, no songs); impossible sources grouped in Settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).first().click();
  await page.waitForURL(/onboarding/);
  await page.getByRole("button", { name: /Skip for now/ }).click();
  await page.waitForURL(/caption-studio/);
  await page.goto("/app/trending");
  await expect(page.getByRole("heading", { name: "Upcoming matches" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Top songs in India" })).toHaveCount(0);
  await page.screenshot({ path: "e2e-shots/trending-full.png", fullPage: true });
  await page.goto("/app/settings#status");
  await page.getByText(/Not possible without platform approval/).click();
  await page.locator("#status").screenshot({ path: "e2e-shots/settings-sources.png" });
});
