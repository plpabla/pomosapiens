// session-access.spec.ts
// Risk #3: Cross-user access -- SSR /session/[id] redirects to /dashboard when the
//   auth cookie belongs to a different user than the session owner (owner filter in
//   src/pages/session/[id].astro returns null row for non-owner, access.ts redirects).
// Risk #5a: Ended session -- SSR /session/[id] redirects to /dashboard when ended_at is set.
// Risk #5b: Long-running session -- the time-based abandon guard was removed (S-03 fold-forward
//   of S-05, see access.ts); SSR /session/[id] must NOT redirect just because started_at is old.
// Seed: tests/e2e/seed.spec.ts
// test-plan.md: §2 Risk #3, Risk #5
import { test, expect } from "@playwright/test";

import type { TwoUserFixture } from "./_fixtures/auth";
import { setupTwoUsers, seedAuthCookie } from "./_fixtures/auth";
import { insertSession } from "./_fixtures/sessions";

// Default preset focus duration (25 min) -- used here only to back-date the fixture well past
// the old (now-removed) 50-min abandon threshold, proving age alone no longer triggers a redirect.
const FOCUS_PRESET_SECONDS = 25 * 60;

let fixture: TwoUserFixture;

test.beforeAll(async () => {
  fixture = await setupTwoUsers();
});

test.afterAll(async () => {
  await fixture.cleanup();
});

test("Risk #3: User B navigating to User A's session URL is redirected to /dashboard", async ({ browser }) => {
  // Insert a running session owned by User A (no endedAt -- session is active).
  const { id } = await insertSession({ userId: fixture.userA.id, startedAt: new Date() });
  const context = await browser.newContext();
  try {
    // Seed User B's cookie -- SSR owner filter (.eq("user_id", user.id)) returns null for B.
    await seedAuthCookie(context, fixture.cookieFor(fixture.userB.id));
    const page = await context.newPage();
    await page.goto(`/session/${id}`);
    await page.waitForURL("**/dashboard");
  } finally {
    await context.close();
  }
});

test("Risk #5a: opening an already-ended session redirects to /dashboard", async ({ browser }) => {
  // Insert a session owned by User A with ended_at set -- access.ts returns redirect.
  const { id } = await insertSession({
    userId: fixture.userA.id,
    startedAt: new Date(),
    endedAt: new Date(),
    focusRating: 3,
  });
  const context = await browser.newContext();
  try {
    await seedAuthCookie(context, fixture.cookieFor(fixture.userA.id));
    const page = await context.newPage();
    await page.goto(`/session/${id}`);
    await page.waitForURL("**/dashboard");
  } finally {
    await context.close();
  }
});

test("Risk #5b: opening an old but non-ended session opens normally, no abandon redirect", async ({ browser }) => {
  // Back-date startedAt by 2 x 25 min + 1 min slack -- this used to exceed the removed
  // abandon threshold in access.ts. The session has no ended_at, so it must stay reachable.
  const oldStartedAt = new Date(Date.now() - (2 * FOCUS_PRESET_SECONDS + 60) * 1000);
  const { id } = await insertSession({ userId: fixture.userA.id, startedAt: oldStartedAt });
  const context = await browser.newContext();
  try {
    await seedAuthCookie(context, fixture.cookieFor(fixture.userA.id));
    const page = await context.newPage();
    await page.goto(`/session/${id}`);
    // No redirect: the page serves the session. The default 25-min preset focus window has
    // already elapsed, so the timer immediately auto-flips to the rating phase (expected, not
    // a bug) -- the assertion here is that we land on /session/<id> rather than /dashboard.
    await expect(page.getByRole("heading", { name: "How was your focus?" })).toBeVisible();
    expect(page.url()).toContain(`/session/${id}`);
  } finally {
    await context.close();
  }
});
