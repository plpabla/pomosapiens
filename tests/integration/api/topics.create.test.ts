/* eslint-disable @typescript-eslint/no-deprecated -- SELF is deprecated upstream; no stable per-test replacement available in vitest-pool-workers */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion -- Response.json() returns any; these casts assert known response shapes */
import { SELF } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoUsers, type TwoUserFixture } from "../../_fixtures/auth";
import { createTestTopic, readTopic } from "../../_fixtures/db";

const BASE = "http://localhost";

describe("POST /api/topics", () => {
  let fixture: TwoUserFixture;

  beforeAll(async () => {
    fixture = await setupTwoUsers();
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await SELF.fetch(`${BASE}/api/topics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Algorithms" }),
    });

    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("Unauthorized");
  });

  it("owner_id from body is ignored -- server-stamps from session (L-01 regression)", async () => {
    const res = await SELF.fetch(`${BASE}/api/topics`, {
      method: "POST",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: `topic-${Date.now()}`, owner_id: fixture.userB.id }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string; archived_at: null };
    const row = await readTopic(body.id);
    expect(row?.owner_id).toBe(fixture.userA.id);
  });

  it("name lands on the created row", async () => {
    const name = `algo-${Date.now()}`;
    const res = await SELF.fetch(`${BASE}/api/topics`, {
      method: "POST",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string; archived_at: null };
    const row = await readTopic(body.id);
    expect(row?.name).toBe(name);
  });

  it("returns 400 for empty body (missing name)", async () => {
    const res = await SELF.fetch(`${BASE}/api/topics`, {
      method: "POST",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for name exceeding 100 characters", async () => {
    const res = await SELF.fetch(`${BASE}/api/topics`, {
      method: "POST",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "x".repeat(101) }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate name from same user", async () => {
    const name = `dup-${Date.now()}`;
    // First POST succeeds
    await createTestTopic(fixture.userA.id, name);

    // Second POST with same name collides
    const res = await SELF.fetch(`${BASE}/api/topics`, {
      method: "POST",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/already exists/i);
  });
});
