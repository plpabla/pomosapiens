/* eslint-disable @typescript-eslint/no-deprecated -- SELF is deprecated upstream; no stable per-test replacement available in vitest-pool-workers */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion -- Response.json() returns any; these casts assert known response shapes */
import { SELF } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoUsers, type TwoUserFixture } from "../../_fixtures/auth";
import { readSession } from "../../_fixtures/db";

const BASE = "http://localhost";

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
      body: JSON.stringify({ energy_level: "medium", user_id: fixture.userB.id }),
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
      body: JSON.stringify({ energy_level: "extreme" }),
    });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/^energy_level:/);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await SELF.fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ energy_level: "low" }),
    });

    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("Unauthorized");
  });
});
