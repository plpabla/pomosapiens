// session-delete.spec.ts
// Risk: the confirm-guarded Delete control on a completed history row must remove the
//   session through DELETE /api/sessions/[id] and RLS, and while confirming, the
//   composed CompletedSessionActions island must hide the row's Edit trigger (Phase 3
//   scope-extension fix) so a user can't open Edit on a row mid-delete. An untouched
//   sibling session proves the delete is scoped to the target row only.
// Seed: tests/e2e/seed.spec.ts
// Plan: context/changes/edit-delete-sessions/plan.md Phase 4, risk 2 (session-delete)
import { test, expect } from "@playwright/test";

import { setupTwoUsers, seedAuthCookie } from "./_fixtures/auth";
import { insertSession } from "./_fixtures/sessions";

test("dashboard Delete control: confirming removes a logged session and hides its Edit trigger while confirming", async ({
  browser,
}) => {
  const fixture = await setupTwoUsers();
  const context = await browser.newContext();
  try {
    // Untouched control session -- must survive the whole test.
    await insertSession({
      userId: fixture.userA.id,
      startedAt: new Date(Date.now() - 120_000),
      endedAt: new Date(Date.now() - 90_000),
      focusRating: 5,
    });
    // Target session -- this is the one that gets deleted.
    await insertSession({
      userId: fixture.userA.id,
      startedAt: new Date(Date.now() - 60_000),
      endedAt: new Date(Date.now() - 30_000),
      focusRating: 2,
    });

    await seedAuthCookie(context, fixture.cookieFor(fixture.userA.id));
    const page = await context.newPage();
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const targetRow = page.getByRole("listitem").filter({ hasText: "★ 2 / 5" });
    const controlRow = page.getByRole("listitem").filter({ hasText: "★ 5 / 5" });
    await expect(targetRow).toBeVisible();
    await expect(controlRow).toBeVisible();
    await expect(targetRow.getByRole("button", { name: "Edit" })).toBeVisible();

    // The Delete control is a client:visible island -- the DOM node exists (and is
    // clickable) before React hydration attaches its handler, so retry the click
    // until the confirm step actually appears rather than assuming the first click landed.
    await expect(async () => {
      await targetRow.getByRole("button", { name: "Delete" }).click();
      await expect(targetRow.getByRole("button", { name: "Confirm?" })).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    // Confirming hides the Edit trigger for this row -- prevents opening Edit while it's
    // mid-delete (the coordination bug fixed by CompletedSessionActions in Phase 3).
    await expect(targetRow.getByRole("button", { name: "Edit" })).toHaveCount(0);

    const [deleteResponse] = await Promise.all([
      page.waitForResponse((res) => res.request().method() === "DELETE" && res.url().includes("/api/sessions/")),
      targetRow.getByRole("button", { name: "Confirm?" }).click(),
    ]);
    expect(deleteResponse.ok()).toBe(true);
    await page.waitForLoadState("load");

    await expect(page.getByText("★ 2 / 5")).toHaveCount(0);
    await expect(page.getByText("★ 5 / 5")).toBeVisible();
  } finally {
    await context.close();
    await fixture.cleanup();
  }
});
