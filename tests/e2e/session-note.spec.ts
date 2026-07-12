// session-note.spec.ts
// Risk: a note typed on the rating screen must travel through the one-shot PATCH
// alongside the rating and appear on the dashboard history card. The one-shot write
// guard (.is("ended_at", null)) means note and rating are submitted in the same
// request -- if either the schema, the PATCH handler, or the dashboard select/render
// drops `note`, this test catches it.
// Seed: tests/e2e/seed.spec.ts
// Plan: context/changes/session-notes-and-chart/plan.md Phase 4, risk 1
import { test, expect } from "@playwright/test";

import { setupTwoUsers, seedAuthCookie } from "./_fixtures/auth";

test("session note: entered on rating screen is saved and shown on dashboard history card", async ({ browser }) => {
  const fixture = await setupTwoUsers();
  const context = await browser.newContext();
  try {
    await seedAuthCookie(context, fixture.cookieFor(fixture.userA.id));
    const page = await context.newPage();

    const noteText = `e2e-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Start a session with Medium energy -- topic/material format are optional and
    // irrelevant to this risk, left unset.
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Start session" }).click();
    await page.waitForURL(/\/session\/new/);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Medium" }).click();
    await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();
    const postSessionResponse = page.waitForResponse(
      (r) => r.url().includes("/api/sessions") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Start" }).click();
    await postSessionResponse;
    await page.waitForURL((url) => url.pathname.startsWith("/session/") && url.pathname !== "/session/new");

    // Stop early to reach the rating screen without waiting out the full preset.
    await page.getByRole("button", { name: "Stop early" }).click();
    await expect(page.getByRole("heading", { name: "How was your focus?" })).toBeVisible();

    // Type the note, then rate -- both must land in the same PATCH call.
    await page.getByLabel("Add a note (optional)").fill(noteText);
    const patchResponse = page.waitForResponse(
      (r) => r.url().includes("/api/sessions/") && r.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "4" }).click();
    await patchResponse;

    // Session saved summary appears after rating -- go straight to the dashboard.
    await expect(page.getByRole("heading", { name: "Session saved" })).toBeVisible();
    await page.getByRole("button", { name: "Go to dashboard" }).click();
    await page.waitForURL("**/dashboard");

    // Scoped to the session-history <ul> -- Astro's dev toolbar intermittently
    // renders island props (including raw session JSON) elsewhere in the DOM,
    // and an unscoped getByText can strict-mode-collide with that dump.
    await expect(page.getByRole("list").getByText(noteText)).toBeVisible();
  } finally {
    await context.close();
    await fixture.cleanup();
  }
});
