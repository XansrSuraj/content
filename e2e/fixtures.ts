import { test as base, type Browser, type BrowserContextOptions } from "@playwright/test";

export { expect } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/** The app defaults to Hinglish; the journey specs assert English copy, so pin English unless a test switches. */
export const englishCookie = [{ name: "ts_lang", value: "english", url: baseURL }];

export const test = base.extend({
  // Named `provide` (Playwright's `use`) so the React hooks lint rule doesn't mistake it for a hook.
  context: async ({ context }, provide) => {
    await context.addCookies(englishCookie);
    await provide(context);
  },
});

export async function englishContext(browser: Browser, options?: BrowserContextOptions) {
  const ctx = await browser.newContext(options);
  await ctx.addCookies(englishCookie);
  return ctx;
}
