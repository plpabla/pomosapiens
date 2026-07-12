// anonymous-capture.spec.ts
// Risk: the anon capture island on "/" persists all state to localStorage and never
// navigates -- a stuck hook/state carried over between the runner and picker phases
// silently blocks the visitor from starting a second session.
// Covers: full anon loop (start -> stop early -> rate -> go to dashboard), then confirms
// the picker is usable again for a second session.
import { test, expect } from "@playwright/test";
import { newAnonPage } from "./_fixtures/anon";

test("anon capture flow: start -> stop early -> rate -> go to dashboard -> start a second session", async ({
  browser,
}) => {
  const { page, cleanup } = await newAnonPage(browser);
  try {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Choose your energy level" })).toBeVisible();
    await page.getByRole("button", { name: "Medium" }).click();
    await page.getByRole("button", { name: "Start" }).click();

    await expect(page.getByRole("button", { name: "Stop early" })).toBeVisible();
    await page.getByRole("button", { name: "Stop early" }).click();

    await expect(page.getByRole("heading", { name: "How was your focus?" })).toBeVisible();
    await page.getByRole("button", { name: "3" }).click();

    await expect(page.getByRole("heading", { name: "Session saved" })).toBeVisible();
    await page.getByRole("button", { name: "Go to dashboard" }).click();

    // Back on the (still client-side, same-page) picker.
    await expect(page.getByRole("heading", { name: "Choose your energy level" })).toBeVisible();

    // Regression: the Start button must not be stuck showing "Starting..." from
    // the first session's submit -- a second session must be startable.
    await page.getByRole("button", { name: "High" }).click();
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("button", { name: "Stop early" })).toBeVisible();
  } finally {
    await cleanup();
  }
});
