import type { Browser, Page } from "@playwright/test";
import { englishContext, expect, test } from "./fixtures";

async function signUp(page: Page, tag: string) {
  await page.goto("/signin?mode=signup");
  await page.getByLabel("Email").fill(`${tag}${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.locator("form").getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/onboarding/);
  await page.getByRole("button", { name: /Skip for now/ }).click();
  await page.waitForURL(/caption-studio/);
}

async function fullFlow(page: Page, shot: string) {
  await signUp(page, `flow-${shot}`);
  // 1. Choose platforms (Instagram Reels is preselected; add YouTube Shorts).
  await page.getByRole("button", { name: "YouTube Shorts", exact: true }).click();
  await expect(page.getByRole("button", { name: "YouTube Shorts", exact: true })).toHaveAttribute("aria-pressed", "true");
  // 2. Optional details.
  await page.getByText("More details (optional)").click();
  await page.getByLabel("What happens in the video (one line)").fill("Fans at home watching the match");

  // 3. Paste caption → the subject is unclear ("MI") → one targeted question.
  await page.getByRole("textbox", { name: "Message" }).fill("MI ka match kal, preview reel");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Which “mi” do you mean?")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Mumbai Indians", exact: true }).click();

  // 4. Interpretation chip, correctable.
  await expect(page.getByText("Understood as:").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: /Match preview/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /Match preview/ }).first().click();
  await page.getByRole("menuitemradio", { name: "Fan opinion" }).click();
  await expect(page.getByRole("button", { name: /Fan opinion/ }).first()).toBeVisible({ timeout: 60_000 });

  // 5. Results: platform tabs, recommended first, alternatives collapsed.
  await expect(page.getByRole("tab", { name: "YouTube Shorts" }).last()).toBeVisible();
  await page.getByText("2 more options").last().click();
  await expect(page.getByText("Conversation focused").last()).toBeVisible();

  // 6. Refine with a chip, then copy.
  await page.getByRole("button", { name: "Make it shorter." }).click();
  await expect(page.getByText("Understood as:").first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Copy caption" }).last().click();
  await expect(page.getByRole("button", { name: "Copied ✓" }).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${process.env.E2E_SHOTS ?? "e2e-shots"}/flow-${shot}.png`, fullPage: true });
}

test("full sports caption flow on desktop", async ({ page, context }) => {
  test.setTimeout(180_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await fullFlow(page, "desktop");
});

test("full sports caption flow on mobile", async ({ browser }: { browser: Browser }) => {
  test.setTimeout(180_000);
  const ctx = await englishContext(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await ctx.newPage();
  await fullFlow(page, "mobile");
  await ctx.close();
});
