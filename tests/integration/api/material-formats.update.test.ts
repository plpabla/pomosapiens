/* eslint-disable @typescript-eslint/no-deprecated -- SELF is deprecated upstream; no stable per-test replacement available in vitest-pool-workers */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion -- Response.json() returns any; these casts assert known response shapes */
import { SELF } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoUsers, type TwoUserFixture } from "../../_fixtures/auth";
import { createTestMaterialFormat, readMaterialFormat, readSeededMaterialFormatId } from "../../_fixtures/db";

const BASE = "http://localhost";

describe("PATCH /api/material-formats/[id]", () => {
  let fixture: TwoUserFixture;
  let seededFormatId: string;

  beforeAll(async () => {
    fixture = await setupTwoUsers();
    seededFormatId = await readSeededMaterialFormatId();
  });

  afterAll(async () => {
    await fixture.cleanup();
  });

  it("renames a format", async () => {
    const id = await createTestMaterialFormat(fixture.userA.id, `rename-src-${Date.now()}`);

    const res = await SELF.fetch(`${BASE}/api/material-formats/${id}`, {
      method: "PATCH",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Renamed Format" }),
    });

    expect(res.status).toBe(200);
    const row = await readMaterialFormat(id);
    expect(row?.name).toBe("Renamed Format");
  });

  it("archives a format by setting archived_at", async () => {
    const id = await createTestMaterialFormat(fixture.userA.id, `archive-fmt-${Date.now()}`);
    const archivedAt = new Date().toISOString();

    const res = await SELF.fetch(`${BASE}/api/material-formats/${id}`, {
      method: "PATCH",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ archived_at: archivedAt }),
    });

    expect(res.status).toBe(200);
    const row = await readMaterialFormat(id);
    expect(row?.archived_at).not.toBeNull();
  });

  it("unarchives a format by setting archived_at to null", async () => {
    const id = await createTestMaterialFormat(fixture.userA.id, `unarchive-fmt-${Date.now()}`);
    await SELF.fetch(`${BASE}/api/material-formats/${id}`, {
      method: "PATCH",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ archived_at: new Date().toISOString() }),
    });

    const res = await SELF.fetch(`${BASE}/api/material-formats/${id}`, {
      method: "PATCH",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ archived_at: null }),
    });

    expect(res.status).toBe(200);
    const row = await readMaterialFormat(id);
    expect(row?.archived_at).toBeNull();
  });

  it("cross-user PATCH returns 409 -- byte-identical with not-found", async () => {
    const id = await createTestMaterialFormat(fixture.userA.id, `cross-user-fmt-${Date.now()}`);

    const res = await SELF.fetch(`${BASE}/api/material-formats/${id}`, {
      method: "PATCH",
      headers: {
        Cookie: fixture.cookieFor(fixture.userB.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Hijacked" }),
    });

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("Material format not found");
    const row = await readMaterialFormat(id);
    expect(row?.name).not.toBe("Hijacked");
  });

  it("seeded-row PATCH returns 409 (seeded-format-protection regression)", async () => {
    const res = await SELF.fetch(`${BASE}/api/material-formats/${seededFormatId}`, {
      method: "PATCH",
      headers: {
        Cookie: fixture.cookieFor(fixture.userA.id),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Hijacked Seeded" }),
    });

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("Material format not found");
  });

  it("rename to an existing name for same user returns 409", async () => {
    const nameA = `fmt-a-${Date.now()}`;
    const nameB = `fmt-b-${Date.now()}`;
    const idA = await createTestMaterialFormat(fixture.userA.id, nameA);
    await createTestMaterialFormat(fixture.userA.id, nameB);

    const res = await SELF.fetch(`${BASE}/api/material-formats/${idA}`, {
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
    const id = await createTestMaterialFormat(fixture.userA.id, `empty-body-fmt-${Date.now()}`);

    const res = await SELF.fetch(`${BASE}/api/material-formats/${id}`, {
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
