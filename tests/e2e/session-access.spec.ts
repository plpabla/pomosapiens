// session-access.spec.ts
// Risk #3: Cross-user access -- SSR /session/[id] redirects to /dashboard when the
//   auth cookie belongs to a different user than the session owner (owner filter in
//   src/pages/session/[id].astro returns null row for non-owner, access.ts redirects).
// Risk #5a: Ended session -- SSR /session/[id] redirects to /dashboard when ended_at is set.
// Risk #5b: Abandoned session -- SSR /session/[id] redirects to /dashboard when
//   started_at is older than 2 x focus preset (50 min for the 25-min preset).
// Seed: tests/e2e/seed.spec.ts
// test-plan.md: §2 Risk #3, Risk #5
import { test } from "@playwright/test";

import type { TwoUserFixture } from "./_fixtures/auth";
import { setupTwoUsers, seedAuthCookie } from "./_fixtures/auth";
import { insertSession } from "./_fixtures/sessions";

// Mirrors the FOCUS_PRESET_SECONDS constant in src/pages/session/[id].astro.
// When S-05 changes the threshold, update both files together.
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

test("Risk #5b: opening an abandoned session (older than 2 x focus preset) redirects to /dashboard", async ({
  browser,
}) => {
  // Back-date startedAt by 2 x 25 min + 1 min slack -- exceeds the threshold in access.ts.
  const abandonedStartedAt = new Date(Date.now() - (2 * FOCUS_PRESET_SECONDS + 60) * 1000);
  const { id } = await insertSession({ userId: fixture.userA.id, startedAt: abandonedStartedAt });
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
