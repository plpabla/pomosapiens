/* eslint-disable @typescript-eslint/no-deprecated -- SELF is deprecated upstream; no stable per-test replacement available in vitest-pool-workers */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion -- Response.json() returns any; these casts assert known response shapes */
import { SELF } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoUsers, type TwoUserFixture } from "../../_fixtures/auth";
import { readSession } from "../../_fixtures/db";

const BASE = "http://localhost";

async function createSession(cookie: string): Promise<{ id: string; started_at: string }> {
  const res = await SELF.fetch(`${BASE}/api/sessions`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      energy_level: "low",
      timer_mode: "preset_1",
      planned_focus_seconds: 25 * 60,
      planned_break_seconds: 5 * 60,
    }),
  });
  if (res.status !== 201) {
    throw new Error(`createSession failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { id: string; started_at: string };
}

async function createEndedSession(cookie: string): Promise<{ id: string; started_at: string }> {
  const session = await createSession(cookie);
  const endRes = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
    method: "PATCH",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ focus_rating: 3, ended_at: new Date().toISOString() }),
  });
  if (endRes.status !== 200) {
    throw new Error(`createEndedSession: PATCH failed: ${endRes.status} ${await endRes.text()}`);
  }
  return session;
}

function editBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    duration_seconds: 1200,
    energy_level: "high",
    topic_id: null,
    material_format_id: null,
    focus_rating: 4,
    note: "corrected",
    ...overrides,
  };
}

describe("PUT /api/sessions/[id]", () => {
  let fixture: TwoUserFixture;

  beforeAll(async () => {
    fixture = await setupTwoUsers();
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  // Column-scope is two-layer: (1) editSessionSchema z.object() strips unknown body keys
  // (user_id, started_at never reach parsed.data); (2) the .update() call pins the write set
  // to exactly the schema's declared columns. This test catches layer-1 failure (schema widened
  // to accept a protected column) + layer-2 failure (endpoint uses .update(parsed.data)) together.
  // See L-01 in context/foundation/lessons.md.
  it("column-scope: extra body keys stripped by Zod and only declared columns written (regression gate for L-01)", async () => {
    const session = await createEndedSession(fixture.cookieFor(fixture.userA.id));
    const garbageUuid = crypto.randomUUID();

    const res = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
      method: "PUT",
      headers: { Cookie: fixture.cookieFor(fixture.userA.id), "Content-Type": "application/json" },
      body: JSON.stringify(
        editBody({
          duration_seconds: 900,
          user_id: garbageUuid,
          started_at: new Date(0).toISOString(),
        }),
      ),
    });

    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);

    const row = await readSession(session.id);
    expect(row.user_id).toBe(fixture.userA.id);
    expect(row.started_at).toBe(session.started_at);
    expect(row.duration_seconds).toBe(900);
  });

  it("recomputes ended_at from the edited duration, holding started_at fixed", async () => {
    const session = await createEndedSession(fixture.cookieFor(fixture.userA.id));

    const res = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
      method: "PUT",
      headers: { Cookie: fixture.cookieFor(fixture.userA.id), "Content-Type": "application/json" },
      body: JSON.stringify(editBody({ duration_seconds: 600 })),
    });

    expect(res.status).toBe(200);
    const row = await readSession(session.id);
    expect(row.duration_seconds).toBe(600);
    expect(row.started_at).toBe(session.started_at);
    expect(row.ended_at).not.toBeNull();
    expect(new Date(row.ended_at ?? "").getTime()).toBe(new Date(session.started_at).getTime() + 600 * 1000);
  });

  it("writes the edited context fields (energy/topic/format/rating/note)", async () => {
    const session = await createEndedSession(fixture.cookieFor(fixture.userA.id));

    const res = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
      method: "PUT",
      headers: { Cookie: fixture.cookieFor(fixture.userA.id), "Content-Type": "application/json" },
      body: JSON.stringify(editBody({ energy_level: "high", focus_rating: 5, note: "edited note" })),
    });

    expect(res.status).toBe(200);
    const row = await readSession(session.id);
    expect(row.energy_level).toBe("high");
    expect(row.focus_rating).toBe(5);
    expect(row.note).toBe("edited note");
  });

  it.each([
    { duration_seconds: 0, expectedStatus: 400, label: "0 rejected" },
    { duration_seconds: -1, expectedStatus: 400, label: "negative rejected" },
    { duration_seconds: 24 * 60 * 60 + 1, expectedStatus: 400, label: "> 24h rejected" },
    { duration_seconds: 1, expectedStatus: 200, label: "1 accepted" },
    { duration_seconds: 24 * 60 * 60, expectedStatus: 200, label: "24h accepted" },
  ])("duration bounds: $label", async ({ duration_seconds, expectedStatus }) => {
    const session = await createEndedSession(fixture.cookieFor(fixture.userA.id));

    const res = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
      method: "PUT",
      headers: { Cookie: fixture.cookieFor(fixture.userA.id), "Content-Type": "application/json" },
      body: JSON.stringify(editBody({ duration_seconds })),
    });

    expect(res.status).toBe(expectedStatus);
  });

  it("returns 404 and leaves the row untouched when editing an in-progress session", async () => {
    const session = await createSession(fixture.cookieFor(fixture.userA.id));

    const res = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
      method: "PUT",
      headers: { Cookie: fixture.cookieFor(fixture.userA.id), "Content-Type": "application/json" },
      body: JSON.stringify(editBody()),
    });

    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("Session not found");

    const row = await readSession(session.id);
    expect(row.ended_at).toBeNull();
  });

  it("returns 404 and leaves the row untouched when user B PUTs user A's ended session", async () => {
    const session = await createEndedSession(fixture.cookieFor(fixture.userA.id));

    const res = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
      method: "PUT",
      headers: { Cookie: fixture.cookieFor(fixture.userB.id), "Content-Type": "application/json" },
      body: JSON.stringify(editBody({ duration_seconds: 300 })),
    });

    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("Session not found");

    const row = await readSession(session.id);
    expect(row.duration_seconds).not.toBe(300);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await SELF.fetch(`${BASE}/api/sessions/${crypto.randomUUID()}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editBody()),
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("Unauthorized");
  });
});
