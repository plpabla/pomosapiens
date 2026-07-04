// focus-rating-chart.spec.ts
// Risk: the dashboard's focus-rating chart must render only once 2+ rated sessions
// exist, and show the friendly empty-state message below that threshold (FR-016).
// This crosses the DB (real rated-session rows) and the rendered UI (client:only
// React island) -- a jsdom test can't prove the SSR-fetched data actually reaches
// and mounts the client component.
// Seed: tests/e2e/seed.spec.ts
// Plan: context/changes/session-notes-and-chart/plan.md Phase 4, risk 2
import { test, expect } from "@playwright/test";

import { setupTwoUsers, seedAuthCookie } from "./_fixtures/auth";
import { insertSession } from "./_fixtures/sessions";

test("focus-rating chart: renders only once 2+ rated sessions exist, empty state below that", async ({ browser }) => {
  const fixture = await setupTwoUsers();
  const context = await browser.newContext();
  try {
    await seedAuthCookie(context, fixture.cookieFor(fixture.userA.id));
    const page = await context.newPage();

    // Zero rated sessions -- fresh user, dashboard shows the empty-state message.
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Rate a few sessions to see your focus trend.")).toBeVisible();
    await expect(page.getByTestId("focus-rating-chart")).toHaveCount(0);

    // One rated session -- still below the 2-point threshold, empty state persists.
    await insertSession({
      userId: fixture.userA.id,
      startedAt: new Date(Date.now() - 60_000),
      endedAt: new Date(Date.now() - 30_000),
      focusRating: 3,
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Rate a few sessions to see your focus trend.")).toBeVisible();

    // Second rated session crosses the threshold -- chart replaces the empty state.
    await insertSession({
      userId: fixture.userA.id,
      startedAt: new Date(),
      endedAt: new Date(),
      focusRating: 5,
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("focus-rating-chart")).toBeVisible();
    await expect(page.getByText("Rate a few sessions to see your focus trend.")).not.toBeVisible();
  } finally {
    await context.close();
    await fixture.cleanup();
  }
});
