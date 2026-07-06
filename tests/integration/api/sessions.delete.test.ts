/* eslint-disable @typescript-eslint/no-deprecated -- SELF is deprecated upstream; no stable per-test replacement available in vitest-pool-workers */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion -- Response.json() returns any; these casts assert known response shapes */
import { SELF } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoUsers, type TwoUserFixture } from "../../_fixtures/auth";
import { sessionExists } from "../../_fixtures/db";

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

describe("DELETE /api/sessions/[id]", () => {
  let fixture: TwoUserFixture;

  beforeAll(async () => {
    fixture = await setupTwoUsers();
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  it("owner can delete their own in-progress session", async () => {
    const session = await createSession(fixture.cookieFor(fixture.userA.id));

    const res = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
      method: "DELETE",
      headers: { Cookie: fixture.cookieFor(fixture.userA.id), "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
    expect(await sessionExists(session.id)).toBe(false);
  });

  // Explicit regression gate for the "fully open" decision: a future reader must not
  // reintroduce the old ended_at IS NULL immutability guard on this handler.
  it("owner can delete their own already-ended session (fully-open regression gate)", async () => {
    const session = await createSession(fixture.cookieFor(fixture.userA.id));

    await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { Cookie: fixture.cookieFor(fixture.userA.id), "Content-Type": "application/json" },
      body: JSON.stringify({ focus_rating: 3, ended_at: new Date().toISOString() }),
    });

    const res = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
      method: "DELETE",
      headers: { Cookie: fixture.cookieFor(fixture.userA.id), "Content-Type": "application/json" },
    });

    expect(res.status).toBe(200);
    expect(await sessionExists(session.id)).toBe(false);
  });

  it("returns 404 and leaves the row untouched when user B deletes user A's session", async () => {
    const session = await createSession(fixture.cookieFor(fixture.userA.id));

    const res = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
      method: "DELETE",
      headers: { Cookie: fixture.cookieFor(fixture.userB.id), "Content-Type": "application/json" },
    });

    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("Session not found");
    expect(await sessionExists(session.id)).toBe(true);
  });

  it("returns byte-identical 404 body for cross-user vs nonexistent id (information-hiding contract)", async () => {
    const session = await createSession(fixture.cookieFor(fixture.userA.id));

    const crossUserRes = await SELF.fetch(`${BASE}/api/sessions/${session.id}`, {
      method: "DELETE",
      headers: { Cookie: fixture.cookieFor(fixture.userB.id), "Content-Type": "application/json" },
    });

    const nonexistentRes = await SELF.fetch(`${BASE}/api/sessions/${crypto.randomUUID()}`, {
      method: "DELETE",
      headers: { Cookie: fixture.cookieFor(fixture.userA.id), "Content-Type": "application/json" },
    });

    expect(crossUserRes.status).toBe(404);
    expect(nonexistentRes.status).toBe(404);

    const crossUserBody = (await crossUserRes.json()) as { error: string };
    const nonexistentBody = (await nonexistentRes.json()) as { error: string };
    expect(JSON.stringify(crossUserBody)).toBe(JSON.stringify(nonexistentBody));
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await SELF.fetch(`${BASE}/api/sessions/${crypto.randomUUID()}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("Unauthorized");
  });
});
