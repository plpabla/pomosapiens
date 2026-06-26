import type { BrowserContext } from "@playwright/test";

export { setupTwoUsers } from "../../_fixtures/auth";
export type { TwoUserFixture, TestUser } from "../../_fixtures/auth";

// Parses the `name=value` string returned by TwoUserFixture.cookieFor() into
// a Playwright Cookie object. Domain must be "localhost" -- Playwright's
// context.addCookies() requires explicit domain+path; the name still derives
// from the Supabase project ref (sb-<ref>-auth-token) as set by the fixture.
export function cookieToPlaywright(cookieHeader: string) {
  const idx = cookieHeader.indexOf("=");
  const name = cookieHeader.slice(0, idx);
  const value = cookieHeader.slice(idx + 1);
  return {
    name,
    value,
    domain: "localhost",
    path: "/",
    httpOnly: false,
    sameSite: "Lax" as const,
    expires: -1,
  };
}

export async function seedAuthCookie(context: BrowserContext, cookieHeader: string): Promise<void> {
  await context.addCookies([cookieToPlaywright(cookieHeader)]);
}
