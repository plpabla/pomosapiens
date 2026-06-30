BEGIN;
SELECT plan(11);

-- -------------------------------------------------------------------------
-- Setup: two test users, one preset each
-- -------------------------------------------------------------------------

INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');

INSERT INTO public.user_presets (id, user_id, slot, focus_seconds, break_seconds) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 1, 1500, 300),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 1, 2700, 600);

-- -------------------------------------------------------------------------
-- As User A
-- -------------------------------------------------------------------------

SELECT set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true);
SET LOCAL ROLE authenticated;

-- 1. User A sees only own preset (not user B's)
SELECT is(count(*)::int, 1, 'user A sees only own preset')
FROM public.user_presets;

-- 2. User A cannot UPDATE user B's preset
WITH upd AS (
  UPDATE public.user_presets SET focus_seconds = 9999
  WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002'
  RETURNING id
)
SELECT is(count(*)::int, 0, 'user A cannot update user B preset')
FROM upd;

-- 3. User A cannot DELETE user B's preset
WITH del AS (
  DELETE FROM public.user_presets
  WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002'
  RETURNING id
)
SELECT is(count(*)::int, 0, 'user A cannot delete user B preset')
FROM del;

-- 4. User A cannot INSERT claiming user B's user_id (RLS WITH CHECK rejects)
SELECT throws_ok(
  $$INSERT INTO public.user_presets (user_id, slot, focus_seconds, break_seconds)
    VALUES ('00000000-0000-0000-0000-000000000002', 2, 1500, 300)$$,
  '42501',
  'new row violates row-level security policy for table "user_presets"',
  'user A cannot insert preset with user B user_id'
);

-- -------------------------------------------------------------------------
-- As anon
-- -------------------------------------------------------------------------

RESET ROLE;
SET LOCAL ROLE anon;

-- 5. anon sees no presets
SELECT is(count(*)::int, 0, 'anon sees 0 presets')
FROM public.user_presets;

-- 6. anon cannot INSERT (no RLS policy for anon role)
SELECT throws_ok(
  $$INSERT INTO public.user_presets (user_id, slot, focus_seconds, break_seconds)
    VALUES ('00000000-0000-0000-0000-000000000001', 2, 1500, 300)$$,
  '42501',
  NULL,
  'anon cannot insert preset'
);

-- 7. anon UPDATE affects 0 rows (no rows visible via RLS)
WITH upd AS (
  UPDATE public.user_presets SET focus_seconds = 9999
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'
  RETURNING id
)
SELECT is(count(*)::int, 0, 'anon cannot update any preset')
FROM upd;

-- 8. anon DELETE affects 0 rows
WITH del AS (
  DELETE FROM public.user_presets
  WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'
  RETURNING id
)
SELECT is(count(*)::int, 0, 'anon cannot delete any preset')
FROM del;

-- -------------------------------------------------------------------------
-- CHECK constraints (run as authenticated User A so RLS does not interfere)
-- -------------------------------------------------------------------------

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true);
SET LOCAL ROLE authenticated;

-- 9. slot = 4 violates CHECK constraint
SELECT throws_ok(
  $$INSERT INTO public.user_presets (user_id, slot, focus_seconds, break_seconds)
    VALUES ('00000000-0000-0000-0000-000000000001', 4, 1500, 300)$$,
  '23514',
  NULL,
  'slot=4 violates CHECK constraint'
);

-- 10. focus_seconds = 30 is below minimum (60)
SELECT throws_ok(
  $$INSERT INTO public.user_presets (user_id, slot, focus_seconds, break_seconds)
    VALUES ('00000000-0000-0000-0000-000000000001', 2, 30, 300)$$,
  '23514',
  NULL,
  'focus_seconds=30 violates CHECK constraint'
);

-- 11. break_seconds = 7200 is above maximum (3600)
SELECT throws_ok(
  $$INSERT INTO public.user_presets (user_id, slot, focus_seconds, break_seconds)
    VALUES ('00000000-0000-0000-0000-000000000001', 2, 1500, 7200)$$,
  '23514',
  NULL,
  'break_seconds=7200 violates CHECK constraint'
);

SELECT * FROM finish();
ROLLBACK;
