import type { Browser, Page } from "@playwright/test";

// Anon mirror of _fixtures/auth.ts: a fresh browser context has no cookies and
// no localStorage by construction, so there is no seeding equivalent to
// setupTwoUsers/seedAuthCookie -- just an isolated context per test.
export async function newAnonPage(browser: Browser): Promise<{ page: Page; cleanup: () => Promise<void> }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { page, cleanup: () => context.close() };
}

export async function clearLocalStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
  });
}
