import { createClient } from "@supabase/supabase-js";

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

export interface TwoUserFixture {
  userA: TestUser;
  userB: TestUser;
  cookieFor: (userId: string) => string;
  cleanup: () => Promise<void>;
}

// Cookie name derivation matches @supabase/supabase-js GoTrueClient.storageKey.
// The key is sb-<projectref>-auth-token where projectref is the hostname
// segment before the first dot (e.g. "localhost" for http://localhost:54321,
// "xyz" for https://xyz.supabase.co). @supabase/ssr reads this cookie and
// decodes the base64url value to reconstruct the session so createServerClient
// in src/lib/supabase.ts can authenticate the request.
function projectRefFrom(url: string): string {
  const hostname = new URL(url).hostname;
  return hostname.split(".")[0] ?? hostname;
}

// Encodes a string as base64url (no padding) using the Web Crypto TextEncoder
// available in both Node.js and the Workers runtime.
function toBase64URL(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function setupTwoUsers(): Promise<TwoUserFixture> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey || !serviceRoleKey) {
    throw new Error("SUPABASE_URL, SUPABASE_KEY, and SUPABASE_SERVICE_ROLE_KEY must be set for integration tests");
  }

  // Guard: this fixture creates and deletes REAL auth users via the service-role
  // admin API. Pointed at a shared/production project it pollutes it with
  // test-<uuid>@example.com accounts (and leaks them whenever cleanup is skipped
  // on a crash/timeout). Refuse any non-local host unless explicitly opted in.
  const host = new URL(supabaseUrl).hostname;
  const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!isLocalHost && process.env.ALLOW_REMOTE_TEST_DB !== "1") {
    throw new Error(
      `Refusing to run data-mutating tests against non-local Supabase host "${host}". ` +
        `Point SUPABASE_URL at a local or throwaway project, or set ALLOW_REMOTE_TEST_DB=1 to override.`,
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const anonClient = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const projectRef = projectRefFrom(supabaseUrl);
  const cookieName = `sb-${projectRef}-auth-token`;

  const cookieMap = new Map<string, string>();

  async function createAndSignIn(): Promise<TestUser> {
    const email = `test-${crypto.randomUUID()}@example.com`;
    const password = crypto.randomUUID();

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      throw new Error(`Failed to create test user: ${createErr.message}`);
    }

    const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr) {
      throw new Error(`Failed to sign in test user: ${signInErr.message}`);
    }

    const sessionJson = JSON.stringify(signInData.session);
    const cookieValue = `base64-${toBase64URL(sessionJson)}`;
    cookieMap.set(created.user.id, `${cookieName}=${cookieValue}`);

    return { id: created.user.id, email, password };
  }

  const [userA, userB] = await Promise.all([createAndSignIn(), createAndSignIn()]);

  const cookieFor = (userId: string): string => {
    const cookie = cookieMap.get(userId);
    if (!cookie) throw new Error(`No cookie for user ${userId}`);
    return cookie;
  };

  const cleanup = async (): Promise<void> => {
    const results = await Promise.allSettled([
      admin.auth.admin.deleteUser(userA.id),
      admin.auth.admin.deleteUser(userB.id),
    ]);
    for (const result of results) {
      if (result.status === "rejected") {
        // eslint-disable-next-line no-console
        console.warn("Fixture cleanup: failed to delete test user:", result.reason);
      }
    }
  };

  return { userA, userB, cookieFor, cleanup };
}
