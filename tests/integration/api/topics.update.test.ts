/* eslint-disable @typescript-eslint/no-deprecated -- SELF is deprecated upstream; no stable per-test replacement available in vitest-pool-workers */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion -- Response.json() returns any; these casts assert known response shapes */
import { SELF } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoUsers, type TwoUserFixture } from "../../_fixtures/auth";
import { createTestTopic, readTopic } from "../../_fixtures/db";

const BASE = "http://localhost";

describe("PATCH /api/topics/[id]", () => {
  let fixture: TwoUserFixture;

  beforeAll(async () => {
    fixture = await setupTwoUsers();
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  it("renames a topic", async () => {
    const id = await createTestTopic(fixture.userA.id, `rename-src-${Date.now()}`);

    const res = await SELF.fetch(`${BASE}/api/topics/${id}`, {
      method: "PATCH",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Renamed Topic" }),
    });

    expect(res.status).toBe(200);
    const row = await readTopic(id);
    expect(row?.name).toBe("Renamed Topic");
  });

  it("archives a topic by setting archived_at", async () => {
    const id = await createTestTopic(fixture.userA.id, `archive-${Date.now()}`);
    const archivedAt = new Date().toISOString();

    const res = await SELF.fetch(`${BASE}/api/topics/${id}`, {
      method: "PATCH",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ archived_at: archivedAt }),
    });

    expect(res.status).toBe(200);
    const row = await readTopic(id);
    expect(row?.archived_at).not.toBeNull();
  });

  it("unarchives a topic by setting archived_at to null", async () => {
    const id = await createTestTopic(fixture.userA.id, `unarchive-${Date.now()}`);
    // Archive first
    await SELF.fetch(`${BASE}/api/topics/${id}`, {
      method: "PATCH",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ archived_at: new Date().toISOString() }),
    });

    // Then unarchive
    const res = await SELF.fetch(`${BASE}/api/topics/${id}`, {
      method: "PATCH",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ archived_at: null }),
    });

    expect(res.status).toBe(200);
    const row = await readTopic(id);
    expect(row?.archived_at).toBeNull();
  });

  it("cross-user PATCH returns 409 -- byte-identical with not-found", async () => {
    const id = await createTestTopic(fixture.userA.id, `cross-user-${Date.now()}`);

    const res = await SELF.fetch(`${BASE}/api/topics/${id}`, {
      method: "PATCH",
      headers: {
        Cookie: fixture.cookieFor(fixture.userB.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Hijacked" }),
    });

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("Topic not found");
    // Row must be unchanged
    const row = await readTopic(id);
    expect(row?.name).not.toBe("Hijacked");
  });

  it("rename to an existing name for same user returns 409", async () => {
    const nameA = `rename-a-${Date.now()}`;
    const nameB = `rename-b-${Date.now()}`;
    const idA = await createTestTopic(fixture.userA.id, nameA);
    await createTestTopic(fixture.userA.id, nameB);

    const res = await SELF.fetch(`${BASE}/api/topics/${idA}`, {
      method: "PATCH",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: nameB }),
    });

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/already exists/i);
  });

  it("returns 400 for empty body (no fields provided)", async () => {
    const id = await createTestTopic(fixture.userA.id, `empty-body-${Date.now()}`);

    const res = await SELF.fetch(`${BASE}/api/topics/${id}`, {
      method: "PATCH",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});
