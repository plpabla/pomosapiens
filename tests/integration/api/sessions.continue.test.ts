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

describe("POST /api/sessions/[id]/continue", () => {
  let fixture: TwoUserFixture;

  beforeAll(async () => {
    fixture = await setupTwoUsers();
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  it("flips a running preset session to count_up and nulls both planned_* columns", async () => {
    const session = await createSession(fixture.cookieFor(fixture.userA.id));

    const res = await SELF.fetch(`${BASE}/api/sessions/${session.id}/continue`, {
      method: "POST",
      headers: { Cookie: fixture.cookieFor(fixture.userA.id), "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);

    const row = await readSession(session.id);
    expect(row.timer_mode).toBe("count_up");
    expect(row.planned_focus_seconds).toBeNull();
    expect(row.planned_break_seconds).toBeNull();
    expect(row.ended_at).toBeNull();
  });

  it("returns 409 and leaves the row unchanged when the session already ended", async () => {
    const session = await createSession(fixture.cookieFor(fixture.userA.id));

    const endRes = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ focus_rating: 3, ended_at: new Date().toISOString() }),
    });
    expect(endRes.status).toBe(200);

    const res = await SELF.fetch(`${BASE}/api/sessions/${session.id}/continue`, {
      method: "POST",
      headers: { Cookie: fixture.cookieFor(fixture.userA.id), "Content-Type": "application/json" },
    });

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("Session already ended or not found");

    const row = await readSession(session.id);
    expect(row.timer_mode).toBe("preset_1");
    expect(row.planned_focus_seconds).toBe(25 * 60);
  });

  it("does not convert another user's session (ownership scoping)", async () => {
    const session = await createSession(fixture.cookieFor(fixture.userA.id));

    const res = await SELF.fetch(`${BASE}/api/sessions/${session.id}/continue`, {
      method: "POST",
      headers: { Cookie: fixture.cookieFor(fixture.userB.id), "Content-Type": "application/json" },
    });

    expect(res.status).toBe(409);

    const row = await readSession(session.id);
    expect(row.timer_mode).toBe("preset_1");
    expect(row.planned_focus_seconds).toBe(25 * 60);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await SELF.fetch(`${BASE}/api/sessions/${crypto.randomUUID()}/continue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("Unauthorized");
  });
});
