import { test, expect } from "./fixtures";

test("sports caption: no fixture → creator adds the match → caption uses it; extra platform version", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/signin?mode=signup");
  await page.getByLabel("Email").fill(`sports${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.locator("form").getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/onboarding/);
  await page.getByRole("button", { name: /Skip for now/ }).click();
  await page.waitForURL(/caption-studio/);

  // Ask for a YouTube Shorts version too.
  await page.getByLabel("YouTube Shorts").check();

  const box = page.getByRole("textbox", { name: "Message" });
  await box.fill("India vs Pakistan kal khelenge — preview reel caption do");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Match context").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("No verified fixture found for this caption").first()).toBeVisible();
  // The extra platform version is shown with its own copy button.
  await expect(page.getByRole("button", { name: "Copy for YouTube Shorts" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Not listed? Add match details" }).click();
  await expect(page.getByLabel("Team 1")).toHaveValue("India");
  await expect(page.getByLabel("Team 2")).toHaveValue("Pakistan");
  await page.getByRole("button", { name: "Save & refresh caption" }).click();

  // A new turn runs with the match attached and labelled as creator-entered.
  await expect(page.getByText("Entered by you — not independently verified").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("India vs Pakistan", { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: `${process.env.E2E_SHOTS ?? "e2e-shots"}/desktop-sports.png`, fullPage: true });
});
