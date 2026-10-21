import { test, expect } from "./fixtures";

test("match page: content plan → caption, calendar file and a downloadable graphic", async ({ page }) => {
  await page.goto("/signin?mode=signup");
  await page.getByLabel("Email").fill(`plan${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.locator("form").getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/onboarding/);
  await page.getByRole("button", { name: /Skip for now/ }).click();
  await page.waitForURL(/caption-studio/);

  // A creator-entered fixture two days ahead keeps the test independent of live feeds.
  const date = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const res = await page.request.post("/api/sports/matches", {
    data: { sport: "cricket", home: "India", away: "Australia", competition: "ODI series", date, time: "13:30" },
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(res.ok()).toBe(true);
  const { match } = await res.json();

  // Navigation is the five creator places.
  for (const name of ["Home", "Caption Studio", "Match Center", "Graphics", "Saved"]) {
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Briefs" })).toHaveCount(0);

  await page.goto(`/app/matches/${match.id}`);
  await expect(page.getByRole("heading", { name: "Content plan" })).toBeVisible();
  await expect(page.getByText("India vs Australia").first()).toBeVisible();
  await expect(page.getByText("Waits for a confirmed result").first()).toBeVisible();
  await expect(page.getByText("#INDvsAUS")).toBeVisible();

  const ics = await page.request.get(`/api/sports/matches/${match.id}/ics`);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("SUMMARY:India vs Australia");

  await page.getByRole("link", { name: "Write caption" }).first().click();
  await page.waitForURL(/caption-studio\?match=/);
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue(/Match: India vs Australia \(ODI series\)/);

  await page.goto(`/app/graphics?match=${match.id}`);
  await page.getByRole("button", { name: /Who wins\?/ }).click();
  await page.getByRole("button", { name: /Full time/ }).click();
  await expect(page.getByText("Enter the score only after the result is confirmed")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG" }).click();
  expect((await download).suggestedFilename()).toMatch(/^India-vs-Australia-result-portrait\.png$/);

  // Mobile: no sideways scrolling on the new pages.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [`/app/matches/${match.id}`, "/app/graphics", "/app/trending"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
