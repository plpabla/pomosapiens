import { describe, expect, it } from "vitest";

// Temporary smoke test -- proves the Workers pool boots.
// Deleted at end of Phase 1 once real integration tests are in place.
describe("worker smoke test", () => {
  it("runs inside the Workers runtime", () => {
    expect(1 + 1).toBe(2);
  });
});
