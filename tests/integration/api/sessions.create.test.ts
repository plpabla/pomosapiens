/* eslint-disable @typescript-eslint/no-deprecated -- SELF is deprecated upstream; no stable per-test replacement available in vitest-pool-workers */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion -- Response.json() returns any; these casts assert known response shapes */
import { SELF } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoUsers, type TwoUserFixture } from "../../_fixtures/auth";
import { createTestMaterialFormat, createTestTopic, readSession } from "../../_fixtures/db";

const BASE = "http://localhost";

const VALID_MODE = {
  timer_mode: "preset_1",
  planned_focus_seconds: 25 * 60,
  planned_break_seconds: 5 * 60,
} as const;

describe("POST /api/sessions", () => {
  let fixture: TwoUserFixture;

  beforeAll(async () => {
    fixture = await setupTwoUsers();
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  it("server-stamps user_id from the session, ignoring the request body (regression gate for L-01)", async () => {
    // Failing assertion if .insert({ user_id: context.locals.user.id }) is ever changed to
    // .insert({ user_id: parsed.data.user_id }) or .insert(parsed.data).
    const res = await SELF.fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ energy_level: "medium", user_id: fixture.userB.id, ...VALID_MODE }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; started_at: string };

    const row = await readSession(body.id);
    expect(row.user_id).toBe(fixture.userA.id);
  });

  it("validates energy_level enum", async () => {
    const res = await SELF.fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ energy_level: "extreme", ...VALID_MODE }),
    });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/^energy_level:/);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await SELF.fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ energy_level: "low", ...VALID_MODE }),
    });

    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("Unauthorized");
  });

  it("topic_id from body is written to the created session row", async () => {
    const topicId = await createTestTopic(fixture.userA.id, `topic-${Date.now()}`);

    const res = await SELF.fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ energy_level: "medium", topic_id: topicId, ...VALID_MODE }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; started_at: string };
    const row = await readSession(body.id);
    expect(row.topic_id).toBe(topicId);
  });

  it("material_format_id from body is written to the created session row", async () => {
    const formatId = await createTestMaterialFormat(fixture.userA.id, `format-${Date.now()}`);

    const res = await SELF.fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ energy_level: "high", material_format_id: formatId, ...VALID_MODE }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; started_at: string };
    const row = await readSession(body.id);
    expect(row.material_format_id).toBe(formatId);
  });

  it("strips unknown body keys -- focus_rating, ended_at, note are not written on POST", async () => {
    const res = await SELF.fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        energy_level: "low",
        focus_rating: 5,
        ended_at: new Date().toISOString(),
        note: "spurious",
        ...VALID_MODE,
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; started_at: string };
    const row = await readSession(body.id);
    expect(row.focus_rating).toBeNull();
    expect(row.ended_at).toBeNull();
    expect(row.note).toBeNull();
  });

  // Regression 7.5: timer_mode is required
  it("returns 400 when timer_mode is missing from POST body", async () => {
    const res = await SELF.fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ energy_level: "medium" }),
    });

    expect(res.status).toBe(400);
  });

  // Regression 7.4: consistency check -- count_up must have null planned durations
  it("returns 400 when timer_mode is count_up but planned_focus_seconds is non-null", async () => {
    const res = await SELF.fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        energy_level: "medium",
        timer_mode: "count_up",
        planned_focus_seconds: 25 * 60,
        planned_break_seconds: 5 * 60,
      }),
    });

    expect(res.status).toBe(400);
  });

  // Regression 7.6: L-01 proof -- focus_rating sent in POST body is not persisted
  it("does not persist focus_rating when sent in POST body alongside valid timer_mode (L-01 hand-pick)", async () => {
    const res = await SELF.fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        energy_level: "medium",
        timer_mode: "preset_1",
        planned_focus_seconds: 25 * 60,
        planned_break_seconds: 5 * 60,
        focus_rating: 5,
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; started_at: string };
    const row = await readSession(body.id);
    expect(row.focus_rating).toBeNull();
    expect(row.timer_mode).toBe("preset_1");
    expect(row.planned_focus_seconds).toBe(25 * 60);
  });
});
