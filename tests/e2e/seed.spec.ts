// seed.spec.ts — quality lever exemplar. Model all generated tests on these patterns:
//   - Role-based locators (getByRole / getByText / getByLabel)
//   - Own BrowserContext per test (auth via seedAuthCookie, never UI login)
//   - Wait for state (waitForURL / toBeVisible), never waitForTimeout
//   - Self-contained: own setup, action, assertion, context.close() in one test
//
// Risk: SSR auth gate smoke -- authenticated user reaches /dashboard.
// Seed pattern source: .claude/skills/10x-e2e/references/seed-test-pattern.md
import { test, expect } from "@playwright/test";

import { setupTwoUsers, seedAuthCookie } from "./_fixtures/auth";

test("authenticated user reaches /dashboard", async ({ browser }) => {
  const fixture = await setupTwoUsers();
  const context = await browser.newContext();
  try {
    await seedAuthCookie(context, fixture.cookieFor(fixture.userA.id));
    const page = await context.newPage();

    await page.goto("/dashboard");

    await expect(page.getByRole("link", { name: "Start session" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  } finally {
    await context.close();
    await fixture.cleanup();
  }
});
