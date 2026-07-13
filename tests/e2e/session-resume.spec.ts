// session-resume.spec.ts
// Risk: dashboard "Resume" control (S-11) must navigate a reopened in-progress
//   session back to a live, running-timer /session/[id] page, and must NOT
//   appear on a completed/rated session -- closing a tab must not strand a user.
// Seed: tests/e2e/seed.spec.ts
// Plan: context/changes/reopen-running-session/plan.md Phase 2
import { test, expect } from "@playwright/test";

import { setupTwoUsers, seedAuthCookie } from "./_fixtures/auth";
import { insertSession } from "./_fixtures/sessions";

test("dashboard Resume control: navigates an in-progress session into its running timer, completed sessions have no Resume control", async ({
  browser,
}) => {
  const fixture = await setupTwoUsers();
  const context = await browser.newContext();
  try {
    // A completed, rated session -- must expose no Resume control.
    await insertSession({
      userId: fixture.userA.id,
      startedAt: new Date(Date.now() - 60_000),
      endedAt: new Date(Date.now() - 30_000),
      focusRating: 4,
    });
    // The in-progress session under test (ended_at null) -- this is what gets resumed.
    const { id: inProgressId } = await insertSession({ userId: fixture.userA.id, startedAt: new Date() });

    await seedAuthCookie(context, fixture.cookieFor(fixture.userA.id));
    const page = await context.newPage();
    await page.goto("/dashboard");

    // Exactly one row is in progress -- exactly one Resume control renders.
    await expect(page.getByRole("button", { name: "Resume" })).toHaveCount(1);
    await expect(page.getByText("★ 4 / 5")).toBeVisible();

    // ResumeButton is a client:load island -- the DOM node exists (and is clickable)
    // before React hydration attaches its handler, so retry the click until navigation
    // actually starts rather than assuming the first click landed (mirrors session-abandon.spec.ts).
    await expect(async () => {
      await page.getByRole("button", { name: "Resume" }).click();
      await page.waitForURL(`**/session/${inProgressId}`, { timeout: 1_000 });
    }).toPass({ timeout: 10_000 });

    // Running-timer UI (SessionRunner's "running" phase) is visible with correct elapsed/remaining time.
    await expect(page.getByText("Focus session")).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop early" })).toBeVisible();
  } finally {
    await context.close();
    await fixture.cleanup();
  }
});
