// session-edit.spec.ts
// Risk: editing a logged session's duration through the dashboard modal must round-trip
//   through PUT /api/sessions/[id] (which recomputes ended_at from started_at + duration,
//   L-01 column-scoped) and back to the SSR-rendered dashboard row. A break in the modal's
//   payload, the PUT handler's write set, or the dashboard select/render would leave the
//   row stale after reload.
// Seed: tests/e2e/seed.spec.ts
// Plan: context/changes/edit-delete-sessions/plan.md Phase 4, risk 1 (session-edit)
import { test, expect } from "@playwright/test";

import { setupTwoUsers, seedAuthCookie } from "./_fixtures/auth";
import { insertSession } from "./_fixtures/sessions";

test("dashboard Edit modal: changing duration and note on a logged session persists after reload", async ({
  browser,
}) => {
  const fixture = await setupTwoUsers();
  const context = await browser.newContext();
  try {
    const now = Date.now();
    await insertSession({
      userId: fixture.userA.id,
      startedAt: new Date(now - 5 * 60_000),
      endedAt: new Date(now),
      energyLevel: "low",
    });

    await seedAuthCookie(context, fixture.cookieFor(fixture.userA.id));
    const page = await context.newPage();
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("5 min.")).toBeVisible();

    // The actions menu is a client:visible island -- the kebab DOM node exists (and is
    // clickable) before React hydration attaches its handler, so retry opening the menu
    // until the Edit item appears rather than assuming the first click landed.
    await expect(async () => {
      await page.getByRole("button", { name: "More actions" }).click();
      await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await expect(page.getByRole("heading", { name: "Edit session" })).toBeVisible();
    await expect(page.getByLabel("Duration (minutes)")).toHaveValue("5");

    const noteText = `e2e-edit-note-${now}`;
    await page.getByLabel("Duration (minutes)").fill("12");
    await page.getByLabel("Note").fill(noteText);

    const [putResponse] = await Promise.all([
      page.waitForResponse((res) => res.request().method() === "PUT" && res.url().includes("/api/sessions/")),
      page.getByRole("button", { name: "Save changes" }).click(),
    ]);
    expect(putResponse.ok()).toBe(true);
    await page.waitForLoadState("load");

    await expect(page.getByText("12 min.")).toBeVisible();
    await expect(page.getByText(noteText)).toBeVisible();
    await expect(page.getByText("5 min.")).not.toBeVisible();
  } finally {
    await context.close();
    await fixture.cleanup();
  }
});
