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

describe("PATCH /api/sessions/[id]", () => {
  let fixture: TwoUserFixture;

  beforeAll(async () => {
    fixture = await setupTwoUsers();
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  // Column-scope is two-layer: (1) endSessionSchema z.object() strips unknown body keys
  // (energy_level, user_id, note never reach parsed.data); (2) .update({ ended_at, focus_rating })
  // pins the write set to exactly those two columns. This test catches layer-1 failure (schema
  // widened to accept energy_level) + layer-2 failure (endpoint uses .update(parsed.data)) together.
  // It does NOT trip on a pure .update(parsed.data) swap alone because today parsed.data
  // equals {ended_at, focus_rating} -- see L-01 in context/foundation/lessons.md.
  it("column-scope: extra body keys stripped by Zod and only declared columns written (regression gate for L-01)", async () => {
    const session = await createSession(fixture.cookieFor(fixture.userA.id));
    const garbageUuid = crypto.randomUUID();

    const res = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        focus_rating: 4,
        ended_at: new Date().toISOString(),
        user_id: garbageUuid,
        energy_level: "high",
        note: "x",
      }),
    });

    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);

    const row = await readSession(session.id);
    expect(row.ended_at).not.toBeNull();
    expect(row.focus_rating).toBe(4);
    expect(row.user_id).toBe(fixture.userA.id);
    expect(row.energy_level).toBe("low");
    // note column was sent in the body but is not in the endpoint's .update() -- must remain null
    expect(row.note).toBeNull();
  });

  it("returns 409 on second PATCH to the same session", async () => {
    const session = await createSession(fixture.cookieFor(fixture.userA.id));

    const first = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        focus_rating: 3,
        ended_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      }),
    });
    expect(first.status).toBe(200);

    const second = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        focus_rating: 5,
        ended_at: new Date(Date.now() - 3 * 60_000).toISOString(),
      }),
    });
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error: string }).error).toBe("Session already ended or not found");

    // first PATCH's focus_rating must be preserved -- second PATCH must not mutate
    const row = await readSession(session.id);
    expect(row.focus_rating).toBe(3);
  });

  // TODO(risk #5): the 2h window may change when risk #5 reconciles the 50-min SSR threshold; update boundary values intentionally.
  it.each([
    { offsetMs: 60_000, expectedStatus: 400, label: "60s in the future" },
    { offsetMs: -(3 * 60 * 60_000), expectedStatus: 400, label: "3 hours ago" },
    { offsetMs: -(60 * 60_000), expectedStatus: 200, label: "1 hour ago" },
  ])("plausibility window: $label", async ({ offsetMs, expectedStatus }) => {
    const session = await createSession(fixture.cookieFor(fixture.userA.id));
    const endedAt = new Date(Date.now() + offsetMs).toISOString();

    const res = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ focus_rating: 3, ended_at: endedAt }),
    });

    expect(res.status).toBe(expectedStatus);
  });

  it.each([
    {
      label: "missing ended_at",
      getBody: () => ({ focus_rating: 3 }),
      expectedStatus: 400,
      errorPattern: /^ended_at:/,
    },
    {
      label: "focus_rating out of range",
      getBody: () => ({ focus_rating: 6, ended_at: new Date().toISOString() }),
      expectedStatus: 400,
      errorPattern: /^focus_rating:/,
    },
    {
      label: "nullable focus_rating accepted",
      getBody: () => ({
        focus_rating: null,
        ended_at: new Date(Date.now() - 60_000).toISOString(),
      }),
      expectedStatus: 200,
      errorPattern: null as RegExp | null,
    },
  ])("validates request body shape: $label", async ({ getBody, expectedStatus, errorPattern }) => {
    const session = await createSession(fixture.cookieFor(fixture.userA.id));

    const res = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(getBody()),
    });

    expect(res.status).toBe(expectedStatus);
    if (errorPattern) {
      expect(((await res.json()) as { error: string }).error).toMatch(errorPattern);
    }
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await SELF.fetch(`${BASE}/api/sessions/${crypto.randomUUID()}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        focus_rating: 3,
        ended_at: new Date().toISOString(),
      }),
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("Unauthorized");
  });

  describe("cross-user", () => {
    // This test pins the API response shape (status 409 + body) at the API boundary.
    // Access-denial enforcement is at the DB layer (RLS sessions_update_own USING clause in
    // supabase/tests/rls_sessions.sql). Removing .eq("user_id", ...) from the endpoint does NOT
    // trip this test because RLS returns zero rows regardless, causing the !data branch to 409.
    // The .eq() guard is defense-in-depth; the DB layer is the authoritative access-denial signal.
    it("returns 409 + no row mutation when user B PATCHes user A's session", async () => {
      const session = await createSession(fixture.cookieFor(fixture.userA.id));

      const res = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: {
          Cookie: fixture.cookieFor(fixture.userB.id),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          focus_rating: 4,
          ended_at: new Date(Date.now() - 60_000).toISOString(),
        }),
      });

      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: string }).error).toBe("Session already ended or not found");

      const row = await readSession(session.id);
      expect(row.ended_at).toBeNull();
      expect(row.focus_rating).toBeNull();
    });

    it("returns byte-identical 409 body for cross-user vs already-ended (information-hiding contract)", async () => {
      // Intentional information-hiding: src/pages/api/sessions/[id].ts:54-56 returns the same
      // 409 body whether the caller is the wrong user or the session is already ended, so callers
      // cannot determine which session IDs belong to other users. Breaking this (e.g. to return
      // 403 for cross-user) is a security regression -- change this test intentionally.
      const session = await createSession(fixture.cookieFor(fixture.userA.id));

      // User A ends the session
      const endRes = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: {
          Cookie: fixture.cookieFor(fixture.userA.id),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          focus_rating: 3,
          ended_at: new Date(Date.now() - 60_000).toISOString(),
        }),
      });
      expect(endRes.status).toBe(200);

      // User B PATCHes user A's now-ended session (cross-user + already-ended)
      const crossUserRes = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: {
          Cookie: fixture.cookieFor(fixture.userB.id),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          focus_rating: 4,
          ended_at: new Date(Date.now() - 30_000).toISOString(),
        }),
      });

      // User A PATCHes their own already-ended session
      const alreadyEndedRes = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: {
          Cookie: fixture.cookieFor(fixture.userA.id),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          focus_rating: 5,
          ended_at: new Date(Date.now() - 15_000).toISOString(),
        }),
      });

      expect(crossUserRes.status).toBe(409);
      expect(alreadyEndedRes.status).toBe(409);

      const crossUserBody = (await crossUserRes.json()) as { error: string };
      const alreadyEndedBody = (await alreadyEndedRes.json()) as { error: string };
      expect(JSON.stringify(crossUserBody)).toBe(JSON.stringify(alreadyEndedBody));
    });
  });
});
