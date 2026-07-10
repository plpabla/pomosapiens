// session-capture.spec.ts
// Risk: full session capture flow -- a broken slice in auth, routing, POST/PATCH API,
// or history rendering blocks the user from completing a session.
// Covers: POST /api/sessions, SessionRunner mount + Stop early, PATCH /api/sessions/[id],
// dashboard history card with energy level, rating, topic chip, and material format chip.
// Seed: tests/e2e/seed.spec.ts
// test-plan.md: §2 cross-cutting risk (Phase 4 regression gate)
import { test, expect } from "@playwright/test";

import type { TwoUserFixture } from "./_fixtures/auth";
import { setupTwoUsers, seedAuthCookie } from "./_fixtures/auth";
import { insertTopic } from "./_fixtures/topics";

let fixture: TwoUserFixture;
let topicName: string;

test.beforeAll(async () => {
  fixture = await setupTwoUsers();
  // material_formats rows are system-seeded (NULL owner_id, visible via RLS) -- no per-user seeding needed.
  // topics ship empty by design; seed one per run to avoid (owner_id, name) unique-constraint collisions.
  topicName = `e2e-topic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await insertTopic({ userId: fixture.userA.id, name: topicName });
});

test.afterAll(async () => {
  await fixture.cleanup();
});

test("session capture flow: dashboard → energy pick → timer → stop early → rate → history", async ({ browser }) => {
  const context = await browser.newContext();
  try {
    // Inject User A's auth cookie -- middleware reads this cookie on every SSR request.
    await seedAuthCookie(context, fixture.cookieFor(fixture.userA.id));
    const page = await context.newPage();

    // Step 1: Land on dashboard, click "Start session" link.
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Start session" }).click();
    // Wait for network idle so all Astro island scripts are loaded and React has hydrated.
    await page.waitForURL(/\/session\/new/);
    await page.waitForLoadState("networkidle");

    // Step 2: Pick energy level, topic, and material format, then submit (POST /api/sessions).
    await page.getByRole("button", { name: "Medium" }).click();
    // Pick the seeded topic.
    await page.getByRole("combobox", { name: "Topic" }).click();
    await page.getByRole("option", { name: topicName }).click();
    // Pick the system-seeded material format ("Writing code" is one of five NULL-owner rows).
    await page.getByRole("combobox", { name: "Material format" }).click();
    await page.getByRole("option", { name: "Writing code" }).click();
    // Wait for React re-render to enable the Start button before clicking it.
    await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();
    // Listen for the POST response before clicking so we don't miss it.
    const postSessionResponse = page.waitForResponse(
      (r) => r.url().includes("/api/sessions") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Start" }).click();
    await postSessionResponse;
    // Wait for navigation from /session/new to /session/<uuid>.
    await page.waitForURL((url) => url.pathname.startsWith("/session/") && url.pathname !== "/session/new");

    // Step 3: Timer view -- SessionRunner is in "running" phase.
    await expect(page.getByRole("button", { name: "Stop early" })).toBeVisible();

    // Step 4: Stop early -- transitions to rating phase without waiting 25 min.
    await page.getByRole("button", { name: "Stop early" }).click();

    // Step 5: Rating phase -- pick rating 4 (PATCH /api/sessions/[id]).
    // Longer timeout: this is a same-island client-side phase transition (not a hydration
    // race -- SessionRunner is already hydrated by this point), but its re-render can lag
    // past the default 5s under heavy parallel-worker CPU contention.
    await expect(page.getByRole("heading", { name: "How was your focus?" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "4" }).click();

    // Step 5b: Session saved summary appears after rating.
    // Go straight to the dashboard without taking the offered break.
    await expect(page.getByRole("heading", { name: "Session saved" })).toBeVisible();
    await page.getByRole("button", { name: "Go to dashboard" }).click();

    // Step 6: Redirected back to /dashboard.
    await page.waitForURL("**/dashboard");

    // Step 7: New session card is visible with correct energy level, rating, and category chips.
    await expect(page.getByText("medium", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(topicName).first()).toBeVisible();
    await expect(page.getByText("Writing code").first()).toBeVisible();
    await expect(page.getByText("★ 4 / 5")).toBeVisible();
  } finally {
    await context.close();
  }
});
