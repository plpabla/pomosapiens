BEGIN;
SELECT plan(9);

-- -------------------------------------------------------------------------
-- Setup: two test users + one user-owned row each.
-- The 5 NULL-owner rows seeded by the migration are already present.
-- -------------------------------------------------------------------------

INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');

INSERT INTO public.material_formats (id, owner_id, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Custom Format A'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Custom Format B');

-- -------------------------------------------------------------------------
-- As User A
-- -------------------------------------------------------------------------

SELECT set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true);
SET LOCAL ROLE authenticated;

-- 1. User A sees all 5 seeded NULL-owner rows + their own = 6 total
SELECT is(count(*)::int, 6, 'user A sees 5 seeded defaults + own format')
FROM public.material_formats;

-- 2. All 5 seeded defaults (owner_id IS NULL) are visible to User A
SELECT is(count(*)::int, 5, 'user A sees 5 seeded NULL-owner material_formats')
FROM public.material_formats WHERE owner_id IS NULL;

-- 3. User A cannot UPDATE user B's format
WITH upd AS (
  UPDATE public.material_formats SET name = 'hacked'
  WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002'
  RETURNING id
)
SELECT is(count(*)::int, 0, 'user A cannot update user B material_format')
FROM upd;

-- 4. User A cannot DELETE user B's format
WITH del AS (
  DELETE FROM public.material_formats
  WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002'
  RETURNING id
)
SELECT is(count(*)::int, 0, 'user A cannot delete user B material_format')
FROM del;

-- 5. User A cannot INSERT claiming user B's owner_id
SELECT throws_ok(
  $$INSERT INTO public.material_formats (owner_id, name)
    VALUES ('00000000-0000-0000-0000-000000000002', 'Stolen Format')$$,
  '42501',
  'new row violates row-level security policy for table "material_formats"',
  'user A cannot insert material_format with user B owner_id'
);

-- 6. User A cannot UPDATE a NULL-owner seeded row
WITH upd AS (
  UPDATE public.material_formats SET name = 'hacked default'
  WHERE owner_id IS NULL
  RETURNING id
)
SELECT is(count(*)::int, 0, 'user A cannot update NULL-owner seeded material_formats')
FROM upd;

-- 7. User A cannot DELETE a NULL-owner seeded row
WITH del AS (
  DELETE FROM public.material_formats
  WHERE owner_id IS NULL
  RETURNING id
)
SELECT is(count(*)::int, 0, 'user A cannot delete NULL-owner seeded material_formats')
FROM del;

-- -------------------------------------------------------------------------
-- As User B — verify seeded defaults are also visible
-- -------------------------------------------------------------------------

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text,
  true);
SET LOCAL ROLE authenticated;

-- 8. User B also sees all 5 seeded defaults + their own = 6 total
SELECT is(count(*)::int, 6, 'user B sees 5 seeded defaults + own format')
FROM public.material_formats;

-- -------------------------------------------------------------------------
-- As anon
-- -------------------------------------------------------------------------

RESET ROLE;
SET LOCAL ROLE anon;

-- 9. anon sees nothing
SELECT is(count(*)::int, 0, 'anon sees 0 material_formats')
FROM public.material_formats;

SELECT * FROM finish();
ROLLBACK;
