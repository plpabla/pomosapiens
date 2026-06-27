BEGIN;
SELECT plan(12);

-- -------------------------------------------------------------------------
-- Setup: two test users, one topic each, one NULL-owner default topic
-- -------------------------------------------------------------------------

INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');

INSERT INTO public.topics (id, owner_id, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Topic A'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Topic B'),
  ('cccccccc-0000-0000-0000-000000000003', NULL,                                   'Default Topic');

-- -------------------------------------------------------------------------
-- As User A
-- -------------------------------------------------------------------------

SELECT set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true);
SET LOCAL ROLE authenticated;

-- 1. User A sees their own topic + the NULL-owner default (2 rows)
SELECT is(count(*)::int, 2, 'user A sees own topic + NULL-owner default')
FROM public.topics;

-- 2. NULL-owner default is visible to User A
SELECT is(count(*)::int, 1, 'NULL-owner topic is visible to user A')
FROM public.topics WHERE id = 'cccccccc-0000-0000-0000-000000000003';

-- 3. User A cannot UPDATE user B's topic
WITH upd AS (
  UPDATE public.topics SET name = 'hacked'
  WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002'
  RETURNING id
)
SELECT is(count(*)::int, 0, 'user A cannot update user B topic')
FROM upd;

-- 4. User A cannot DELETE user B's topic
WITH del AS (
  DELETE FROM public.topics
  WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002'
  RETURNING id
)
SELECT is(count(*)::int, 0, 'user A cannot delete user B topic')
FROM del;

-- 5. User A cannot INSERT claiming user B's owner_id
SELECT throws_ok(
  $$INSERT INTO public.topics (owner_id, name)
    VALUES ('00000000-0000-0000-0000-000000000002', 'Stolen Topic')$$,
  '42501',
  'new row violates row-level security policy for table "topics"',
  'user A cannot insert topic with user B owner_id'
);

-- 6. User A cannot UPDATE the NULL-owner default topic (owner_id IS NULL ≠ auth.uid())
WITH upd AS (
  UPDATE public.topics SET name = 'hacked default'
  WHERE id = 'cccccccc-0000-0000-0000-000000000003'
  RETURNING id
)
SELECT is(count(*)::int, 0, 'user A cannot update NULL-owner default topic')
FROM upd;

-- 7. User A cannot DELETE the NULL-owner default topic
WITH del AS (
  DELETE FROM public.topics
  WHERE id = 'cccccccc-0000-0000-0000-000000000003'
  RETURNING id
)
SELECT is(count(*)::int, 0, 'user A cannot delete NULL-owner default topic')
FROM del;

-- -------------------------------------------------------------------------
-- As User B — verify NULL-owner row is also visible to a different user
-- -------------------------------------------------------------------------

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text,
  true);
SET LOCAL ROLE authenticated;

-- 8. User B sees their own topic + the NULL-owner default (2 rows)
SELECT is(count(*)::int, 2, 'user B sees own topic + NULL-owner default')
FROM public.topics;

-- -------------------------------------------------------------------------
-- As anon
-- -------------------------------------------------------------------------

RESET ROLE;
SET LOCAL ROLE anon;

-- 9. anon sees nothing — including the NULL-owner default row
SELECT is(count(*)::int, 0, 'anon sees 0 topics')
FROM public.topics;

-- -------------------------------------------------------------------------
-- archived_at coverage (as User A)
-- -------------------------------------------------------------------------

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true);
SET LOCAL ROLE authenticated;

-- 10. User A can set archived_at on their own topic
WITH upd AS (
  UPDATE public.topics SET archived_at = now()
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'
  RETURNING id
)
SELECT is(count(*)::int, 1, 'user A can archive their own topic')
FROM upd;

-- 11. User A cannot set archived_at on User B's topic (cross-user denial)
WITH upd AS (
  UPDATE public.topics SET archived_at = now()
  WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002'
  RETURNING id
)
SELECT is(count(*)::int, 0, 'user A cannot archive user B topic')
FROM upd;

-- -------------------------------------------------------------------------
-- As anon: cannot UPDATE archived_at
-- -------------------------------------------------------------------------

RESET ROLE;
SET LOCAL ROLE anon;

-- 12. anon cannot set archived_at on any topic
WITH upd AS (
  UPDATE public.topics SET archived_at = now()
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'
  RETURNING id
)
SELECT is(count(*)::int, 0, 'anon cannot archive any topic')
FROM upd;

SELECT * FROM finish();
ROLLBACK;
