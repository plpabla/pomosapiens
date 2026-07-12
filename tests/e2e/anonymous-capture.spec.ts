// anonymous-capture.spec.ts
// Risk: the anon capture island on "/" persists all state to localStorage and never
// navigates -- a stuck hook/state carried over between the runner and picker phases
// silently blocks the visitor from starting a second session; local rows must survive
// a reload and a mid-session refresh must resume the running timer rather than
// restarting the picker; duplicate inline topic names must be rejected client-side.
// Seed: tests/e2e/seed.spec.ts
// Plan: context/changes/anonymous-sessions/plan.md Phase 5, contract scenarios 1-4
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

test("anon capture flow: inline topic + note persist across reload with read-only history", async ({ browser }) => {
  const { page, cleanup } = await newAnonPage(browser);
  try {
    const topicName = `e2e-anon-topic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const noteText = `e2e-anon-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Choose your energy level" })).toBeVisible();

    // Inline topic creation -- the anon-only affordance replacing the authed topic picker's seeded row.
    await page.getByRole("button", { name: "New topic" }).click();
    await page.getByPlaceholder("Topic name").fill(topicName);
    await page.getByRole("button", { name: "Confirm" }).click();
    // Auto-selection: the newly created topic becomes the TopicSelect's value without opening the dropdown.
    await expect(page.getByRole("combobox", { name: "Topic" })).toHaveText(topicName);

    await page.getByRole("combobox", { name: "Material format" }).click();
    await page.getByRole("option", { name: "Writing code" }).click();
    await page.getByRole("button", { name: "Medium" }).click();
    await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();
    await page.getByRole("button", { name: "Start" }).click();

    await expect(page.getByRole("button", { name: "Stop early" })).toBeVisible();
    await page.getByRole("button", { name: "Stop early" }).click();

    await expect(page.getByRole("heading", { name: "How was your focus?" })).toBeVisible();
    await page.getByLabel("Add a note (optional)").fill(noteText);
    await page.getByRole("button", { name: "3" }).click();

    await expect(page.getByRole("heading", { name: "Session saved" })).toBeVisible();
    await page.getByRole("button", { name: "Go to dashboard" }).click();

    // Read-only history row: topic tag, material format tag, note, and rating all present.
    // Tags use getByTitle -- getByText also matches the hidden native <select> option
    // Radix renders for HTML form participation, which is never the visible tag.
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
    await expect(page.getByTitle(topicName)).toBeVisible();
    await expect(page.getByTitle("Writing code")).toBeVisible();
    await expect(page.getByText(noteText)).toBeVisible();
    await expect(page.getByText("★ 3 / 5")).toBeVisible();
    // No mutation controls -- the authed dashboard's Edit/Delete/Abandon actions must not render here.
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Abandon" })).toHaveCount(0);

    // Reload persistence: the completed session and its history row must survive a full page reload.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Choose your energy level" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
    await expect(page.getByTitle(topicName)).toBeVisible();
    await expect(page.getByText(noteText)).toBeVisible();
    await expect(page.getByText("★ 3 / 5")).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("anon capture flow: mid-session refresh resumes the running timer", async ({ browser }) => {
  const { page, cleanup } = await newAnonPage(browser);
  try {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Choose your energy level" })).toBeVisible();

    await page.getByRole("button", { name: "Medium" }).click();
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("button", { name: "Stop early" })).toBeVisible();

    await page.reload();
    await page.waitForLoadState("networkidle");

    // Resumed straight into the running view -- not back on the picker.
    await expect(page.getByRole("button", { name: "Stop early" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choose your energy level" })).not.toBeVisible();
  } finally {
    await cleanup();
  }
});

test("anon capture flow: duplicate inline topic name is rejected without creating a row", async ({ browser }) => {
  const { page, cleanup } = await newAnonPage(browser);
  try {
    const topicName = `e2e-anon-dup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Choose your energy level" })).toBeVisible();

    await page.getByRole("button", { name: "New topic" }).click();
    await page.getByPlaceholder("Topic name").fill(topicName);
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByRole("combobox", { name: "Topic" })).toHaveText(topicName);

    // Re-attempt the same name -- must reject inline and not add a second row to the store.
    await page.getByRole("button", { name: "New topic" }).click();
    await page.getByPlaceholder("Topic name").fill(topicName);
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("A topic with this name already exists")).toBeVisible();

    await page.getByRole("combobox", { name: "Topic" }).click();
    await expect(page.getByRole("option", { name: topicName })).toHaveCount(1);
  } finally {
    await cleanup();
  }
});
