BEGIN;
SELECT plan(10);

-- -------------------------------------------------------------------------
-- Setup: two test users + one session each (runs as postgres/service role)
-- -------------------------------------------------------------------------

INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');

INSERT INTO public.sessions (id, user_id, started_at, energy_level) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', now(), 'medium'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', now(), 'high');

-- -------------------------------------------------------------------------
-- As User A
-- -------------------------------------------------------------------------

SELECT set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true);
SET LOCAL ROLE authenticated;

-- 1. User A sees only their own session
SELECT is(count(*)::int, 1, 'user A sees 1 session')
FROM public.sessions;

-- 2. User A can update their own session's note
WITH upd AS (
  UPDATE public.sessions SET note = 'my note'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'
  RETURNING id
)
SELECT is(count(*)::int, 1, 'user A can update their own session note')
FROM upd;

-- 3. User A cannot UPDATE user B's session (CTE at top level; count(*) ensures 1 output row)
WITH upd AS (
  UPDATE public.sessions SET note = 'hacked'
  WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002'
  RETURNING id
)
SELECT is(count(*)::int, 0, 'user A cannot update user B session')
FROM upd;

-- 4. User A cannot DELETE user B's session
WITH del AS (
  DELETE FROM public.sessions
  WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002'
  RETURNING id
)
SELECT is(count(*)::int, 0, 'user A cannot delete user B session')
FROM del;

-- 5. User A can DELETE their own session — sessions_delete_own reinstated (fully open) by
-- 20260706120000_add_sessions_delete_policy.sql for the explicit abandon flow (S-05).
-- Uses a throwaway row so the fixture row (aaaaaaaa-...) survives for the anon-block tests below.
INSERT INTO public.sessions (id, user_id, started_at, energy_level) VALUES
  ('cccccccc-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', now(), 'medium');

WITH del AS (
  DELETE FROM public.sessions
  WHERE id = 'cccccccc-0000-0000-0000-000000000003'
  RETURNING id
)
SELECT is(count(*)::int, 1, 'user A can delete their own session (explicit abandon)')
FROM del;

-- 6. User A cannot INSERT claiming user B's id (RLS WITH CHECK violation → 42501)
SELECT throws_ok(
  $$INSERT INTO public.sessions (user_id, started_at, energy_level)
    VALUES ('00000000-0000-0000-0000-000000000002', now(), 'low')$$,
  '42501',
  'new row violates row-level security policy for table "sessions"',
  'user A cannot insert session with user B id'
);

-- -------------------------------------------------------------------------
-- As anon
-- -------------------------------------------------------------------------

RESET ROLE;
SET LOCAL ROLE anon;

-- 7. anon sees no sessions
SELECT is(count(*)::int, 0, 'anon sees 0 sessions')
FROM public.sessions;

-- 8. anon cannot INSERT (no INSERT policy for anon → 42501)
SELECT throws_ok(
  $$INSERT INTO public.sessions (user_id, started_at, energy_level)
    VALUES ('00000000-0000-0000-0000-000000000001', now(), 'low')$$,
  '42501',
  'new row violates row-level security policy for table "sessions"',
  'anon cannot insert session'
);

-- 9. anon cannot UPDATE (no rows visible)
WITH upd AS (
  UPDATE public.sessions SET note = 'hacked'
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'
  RETURNING id
)
SELECT is(count(*)::int, 0, 'anon cannot update session')
FROM upd;

-- 10. anon cannot DELETE (no rows visible)
WITH del AS (
  DELETE FROM public.sessions
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'
  RETURNING id
)
SELECT is(count(*)::int, 0, 'anon cannot delete session')
FROM del;

SELECT * FROM finish();
ROLLBACK;
