import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.E2E_SHOTS ?? "e2e-shots";
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

async function signUp(page: Page, email: string) {
  await page.goto("/signin?mode=signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.locator("form").getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/onboarding/);
}

async function sendCaption(page: Page, text: string) {
  await page.getByLabel("Message").fill(text);
  await page.getByRole("button", { name: /Bhejo|Send/ }).click();
  await expect(page.getByText("Option A").first()).toBeVisible({ timeout: 60_000 });
}

test("demo creator completes the primary journey", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).first().click();
  await page.waitForURL(/onboarding/);
  await expect(page.getByText("Demo account", { exact: true })).toBeVisible();
  await page.getByText("Tech & gadgets").click();
  await page.getByRole("button", { name: "Save & see ideas" }).click();
  await page.waitForURL(/\/app$/);
  await expect(page.getByText("Demo mode", { exact: true })).toBeVisible();

  // Opportunities with evidence
  await page.goto("/app/opportunities");
  await expect(page.getByText("Demo sample data").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/desktop-opportunities.png`, fullPage: true });
  await page.getByRole("link", { name: "Budget phone se cinematic shots" }).click();
  await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
  await expect(page.getByText("Demo sample — not real data")).toBeVisible();
  await expect(page.getByText(/Comparable observations only/)).toBeVisible();
  await page.getByRole("button", { name: "☆ Save" }).click();
  await expect(page.getByRole("button", { name: "★ Saved" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/desktop-opportunity-detail.png`, fullPage: true });

  // Brief
  await page.getByRole("link", { name: "Generate brief" }).first().click();
  await page.waitForURL(/briefs\/new/);
  await page.getByRole("button", { name: "Generate brief" }).click();
  await page.waitForURL(/briefs\/[0-9a-f-]{36}/, { timeout: 60_000 });
  await expect(page.getByText("Verify before posting")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/desktop-brief.png`, fullPage: true });

  // Caption Studio from the brief
  await page.getByRole("link", { name: "Write caption in Studio" }).click();
  await page.waitForURL(/caption-studio\?brief=/);
  await expect(page.getByLabel("Message")).not.toHaveValue("");
  await page.getByRole("button", { name: /Bhejo|Send/ }).click();
  await expect(page.getByText("Option A").first()).toBeVisible({ timeout: 60_000 });
  await page.waitForURL(/c=/);

  // Follow-up keeps the conversation
  await page.getByRole("button", { name: "Emoji hata do." }).click();
  await expect(page.getByText("Option A", { exact: true })).toHaveCount(2, { timeout: 60_000 });

  // Copy hashtags: success is only shown when the clipboard write succeeds
  await page.getByRole("button", { name: "Copy hashtags" }).first().click();
  await expect(page.getByRole("button", { name: "Copied ✓" }).first()).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toMatch(/^#/);

  // Edit, then save an option
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.getByLabel("Edit caption", { exact: true }).first().fill("Mera edited caption.");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Saved ✓" }).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/desktop-studio.png`, fullPage: true });

  // Saved
  await page.goto("/app/saved");
  await expect(page.getByText("Mera edited caption.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Budget phone se cinematic shots (demo)" })).toBeVisible();

  // Published link + manual feedback
  await page.goto("/app/published");
  await page.getByLabel("Post link").fill("https://www.instagram.com/reel/abc123/");
  await page.getByRole("button", { name: "Add published post" }).click();
  await expect(page.getByText("Link saved.")).toBeVisible();
  await page.reload();
  await page.getByLabel("How did it do (your view)?").first().selectOption("better");
  await page.getByLabel("views").first().fill("1200");
  await page.getByRole("button", { name: "Save feedback" }).first().click();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.getByLabel("How did it do (your view)?").first()).toHaveValue("better");
  await expect(page.getByText("Manually entered by you · not platform data.").first()).toBeVisible();
});

test("real creator opens Caption Studio directly and sees honest unconfigured states", async ({ page }) => {
  await signUp(page, `creator${unique()}@example.com`);
  await page.getByRole("button", { name: /Skip for now/ }).click();
  await page.waitForURL(/caption-studio/);
  await expect(page.getByText("AI is not configured on this server")).toBeVisible();
  await sendCaption(page, "Aaj maine apne budget phone se cinematic video shoot kiya. Instagram ke liye better Hinglish caption do.");
  await expect(page.getByText("Template preview — not AI").first()).toBeVisible();
  await expect(page.getByText("Relevant hashtag suggestions. Current trend status not verified.")).toBeVisible();
  await expect(page.getByText(/\btrending\b/i)).toHaveCount(0);

  // Rename and delete the conversation
  await page.waitForURL(/c=/);
  await page.getByRole("button", { name: /^Rename / }).first().click();
  await page.getByLabel("New title").fill("Budget phone reel");
  await page.getByLabel("New title").press("Enter");
  await expect(page.getByText("Budget phone reel")).toBeVisible();
  await page.getByRole("button", { name: "Delete Budget phone reel" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Budget phone reel")).toHaveCount(0);

  // No demo data in a real account
  await page.goto("/app/opportunities?dataset=observed");
  await expect(page.getByText("Trend provider unavailable").first()).toBeVisible();
  await expect(page.getByText("Budget phone se cinematic shots")).toHaveCount(0);

  // Not an admin
  await page.goto("/admin");
  await page.waitForURL(/\/app$/);
});

test("private records are isolated between accounts", async ({ browser }) => {
  const a = await browser.newContext();
  const pa = await a.newPage();
  await signUp(pa, `alice${unique()}@example.com`);
  await pa.getByRole("button", { name: /Skip for now/ }).click();
  await sendCaption(pa, "Alice ka private caption about chai.");
  await pa.waitForURL(/c=/);
  const convId = new URL(pa.url()).searchParams.get("c")!;

  const b = await browser.newContext();
  const pb = await b.newPage();
  await signUp(pb, `bob${unique()}@example.com`);
  await pb.getByRole("button", { name: /Skip for now/ }).click();
  await pb.goto(`/app/caption-studio?c=${convId}`);
  await expect(pb.getByText("Alice ka private caption about chai.")).toHaveCount(0);

  const origin = new URL(pb.url()).origin;
  expect((await pb.request.delete(`/api/captions/conversations/${convId}`, { headers: { Origin: origin } })).status()).toBe(404);
  expect((await pb.request.patch(`/api/captions/conversations/${convId}`, { data: { title: "pwned" }, headers: { Origin: origin } })).status()).toBe(404);
  expect((await pb.request.post(`/api/captions/turn`, { data: { conversationId: convId, message: "hi" }, headers: { Origin: origin } })).status()).toBe(404);
  // Cross-site requests are rejected
  expect((await pb.request.post(`/api/captions/turn`, { data: { message: "hi" }, headers: { Origin: "https://evil.example" } })).status()).toBe(403);

  await pa.reload();
  await expect(pa.getByText("Alice ka private caption about chai.", { exact: true }).first()).toBeVisible();
  await a.close();
  await b.close();
});

test("unauthenticated and job endpoints are protected", async ({ request }) => {
  expect((await request.post("/api/captions/turn", { data: { message: "x" } })).status()).toBe(401);
  const ingest = await request.post("/api/jobs/ingest", { headers: { Authorization: "Bearer wrong" } });
  expect([401, 404]).toContain(ingest.status());
  const res = await request.get("/admin", { maxRedirects: 0 });
  expect([307, 308]).toContain(res.status());
});

test("admin email gets admin access", async ({ page }) => {
  test.skip(!process.env.E2E_ADMIN, "Set E2E_ADMIN=1 when ADMIN_EMAILS includes admin@example.com");
  await page.goto("/signin");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("admin-password-123");
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await page.waitForLoadState("networkidle");
  if (page.url().includes("signin")) {
    await page.goto("/signin?mode=signup");
    await page.getByLabel("Email").fill("admin@example.com");
    await page.getByLabel("Password").fill("admin-password-123");
    await page.locator("form").getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/onboarding/);
  }
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Research & admin" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/desktop-admin.png`, fullPage: true });
});

test("core layouts work on mobile", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.screenshot({ path: `${SHOTS}/mobile-landing.png`, fullPage: true });
  await page.getByRole("button", { name: "Try the demo" }).first().click();
  await page.waitForURL(/onboarding/);
  await page.getByRole("button", { name: /Skip for now/ }).click();
  await page.waitForURL(/caption-studio/);
  await sendCaption(page, "Ghar par cafe-style chai banayi. Reel ke liye caption do.");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SHOTS}/mobile-studio.png` });
  await page.getByRole("button", { name: "Edit caption settings" }).click();
  await expect(page.getByLabel("Platform")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/mobile-studio-settings.png` });
  await page.getByRole("button", { name: "Done" }).click();
  await page.goto("/app/opportunities");
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow2).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SHOTS}/mobile-opportunities.png`, fullPage: true });
  await ctx.close();
});
