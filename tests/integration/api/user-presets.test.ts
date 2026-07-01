/* eslint-disable @typescript-eslint/no-deprecated -- SELF is deprecated upstream; no stable per-test replacement available in vitest-pool-workers */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion -- Response.json() returns any; these casts assert known response shapes */
import { SELF } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoUsers, type TwoUserFixture } from "../../_fixtures/auth";

const BASE = "http://localhost";

interface Preset {
  slot: number;
  focus_seconds: number;
  break_seconds: number;
}

describe("GET /api/user-presets", () => {
  let fixture: TwoUserFixture;

  beforeAll(async () => {
    fixture = await setupTwoUsers();
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await SELF.fetch(`${BASE}/api/user-presets`);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("Unauthorized");
  });

  it("returns three default slots for a fresh account", async () => {
    const res = await SELF.fetch(`${BASE}/api/user-presets`, {
      headers: { Cookie: fixture.cookieFor(fixture.userA.id) },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { presets: Preset[] };
    expect(body.presets).toHaveLength(3);

    expect(body.presets[0]).toMatchObject({ slot: 1, focus_seconds: 25 * 60, break_seconds: 5 * 60 });
    expect(body.presets[1]).toMatchObject({ slot: 2, focus_seconds: 45 * 60, break_seconds: 10 * 60 });
    expect(body.presets[2]).toMatchObject({ slot: 3, focus_seconds: 90 * 60, break_seconds: 15 * 60 });
  });
});

describe("PUT /api/user-presets/[slot]", () => {
  let fixture: TwoUserFixture;

  beforeAll(async () => {
    fixture = await setupTwoUsers();
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await SELF.fetch(`${BASE}/api/user-presets/1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ focus_seconds: 1500, break_seconds: 300 }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for slot 4 (invalid slot)", async () => {
    const res = await SELF.fetch(`${BASE}/api/user-presets/4`, {
      method: "PUT",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ focus_seconds: 1500, break_seconds: 300 }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when focus_seconds is below minimum", async () => {
    const res = await SELF.fetch(`${BASE}/api/user-presets/1`, {
      method: "PUT",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ focus_seconds: 30, break_seconds: 300 }),
    });
    expect(res.status).toBe(400);
  });

  it("upserts slot 2 and next GET reflects the change", async () => {
    const putRes = await SELF.fetch(`${BASE}/api/user-presets/2`, {
      method: "PUT",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ focus_seconds: 50 * 60, break_seconds: 10 * 60 }),
    });
    expect(putRes.status).toBe(200);
    const updated = (await putRes.json()) as Preset;
    expect(updated.slot).toBe(2);
    expect(updated.focus_seconds).toBe(50 * 60);
    expect(updated.break_seconds).toBe(10 * 60);

    const getRes = await SELF.fetch(`${BASE}/api/user-presets`, {
      headers: { Cookie: fixture.cookieFor(fixture.userA.id) },
    });
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as { presets: Preset[] };
    const slot2 = body.presets.find((p) => p.slot === 2);
    expect(slot2).toMatchObject({ slot: 2, focus_seconds: 50 * 60, break_seconds: 10 * 60 });
  });

  it("user A's preset does not appear on user B's GET (cross-user RLS isolation)", async () => {
    // User A sets slot 1 to a distinctive value
    await SELF.fetch(`${BASE}/api/user-presets/1`, {
      method: "PUT",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ focus_seconds: 77 * 60, break_seconds: 7 * 60 }),
    });

    // User B's slot 1 should still show the default
    const res = await SELF.fetch(`${BASE}/api/user-presets`, {
      headers: { Cookie: fixture.cookieFor(fixture.userB.id) },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { presets: Preset[] };
    const slot1 = body.presets.find((p) => p.slot === 1);
    expect(slot1).toMatchObject({ slot: 1, focus_seconds: 25 * 60, break_seconds: 5 * 60 });
  });
});
