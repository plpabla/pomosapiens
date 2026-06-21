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
    body: JSON.stringify({ energy_level: "low" }),
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

  it("silently strips columns outside the contract (regression gate for L-01)", async () => {
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
    { offsetMs: 10_000, expectedStatus: 400, label: "10s in the future" },
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
});
