// session-abandon.spec.ts
// Risk: explicit dashboard "Abandon" control (S-05) must delete an in-progress session end
//   to end (auth -> DELETE /api/sessions/[id] -> RLS -> DB -> reloaded dashboard), and must
//   NOT appear on a completed/rated session -- the two-step confirm must not fire the delete
//   before the second click.
// Seed: tests/e2e/seed.spec.ts
// Plan: context/changes/explicit-session-abandon/plan.md Phase 5
import { test, expect } from "@playwright/test";

import { setupTwoUsers, seedAuthCookie } from "./_fixtures/auth";
import { insertSession } from "./_fixtures/sessions";

test("dashboard Abandon control: two-step confirm deletes an in-progress session, completed sessions have no Abandon control", async ({
  browser,
}) => {
  const fixture = await setupTwoUsers();
  const context = await browser.newContext();
  try {
    // A completed, rated session -- must survive the whole test with no Abandon control.
    await insertSession({
      userId: fixture.userA.id,
      startedAt: new Date(Date.now() - 60_000),
      endedAt: new Date(Date.now() - 30_000),
      focusRating: 4,
    });
    // The in-progress session under test (ended_at null) -- this is what gets abandoned.
    await insertSession({ userId: fixture.userA.id, startedAt: new Date() });

    await seedAuthCookie(context, fixture.cookieFor(fixture.userA.id));
    const page = await context.newPage();
    await page.goto("/dashboard");

    // Exactly one row is in progress -- exactly one Abandon control renders.
    await expect(page.getByRole("button", { name: "Abandon" })).toHaveCount(1);
    await expect(page.getByText("★ 4 / 5")).toBeVisible();

    await page.getByRole("button", { name: "Abandon" }).click();
    await expect(page.getByRole("button", { name: "Confirm?" })).toBeVisible();
    const cancelButton = page.getByRole("button", { name: "Cancel" });
    await expect(cancelButton).toBeVisible();

    // Cancel reverts without deleting -- no DELETE request may fire from this click.
    let deleteFired = false;
    const trackDelete = (req: import("@playwright/test").Request) => {
      if (req.method() === "DELETE" && req.url().includes("/api/sessions/")) deleteFired = true;
    };
    page.on("request", trackDelete);
    await cancelButton.click();
    await expect(page.getByRole("button", { name: "Abandon" })).toBeVisible();
    expect(deleteFired).toBe(false);
    page.off("request", trackDelete);

    // Confirming the second time actually deletes -- wait for the real DELETE response,
    // then for the app's own window.location.reload() to complete the round trip.
    await page.getByRole("button", { name: "Abandon" }).click();
    const [deleteResponse] = await Promise.all([
      page.waitForResponse((res) => res.request().method() === "DELETE" && res.url().includes("/api/sessions/")),
      page.getByRole("button", { name: "Confirm?" }).click(),
    ]);
    expect(deleteResponse.ok()).toBe(true);
    await page.waitForLoadState("load");

    // Abandoned session is gone; the untouched completed/rated session remains.
    await expect(page.getByRole("button", { name: "Abandon" })).toHaveCount(0);
    await expect(page.getByText("★ 4 / 5")).toBeVisible();
  } finally {
    await context.close();
    await fixture.cleanup();
  }
});
