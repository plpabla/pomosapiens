-- Add archived_at column to topics and material_formats for soft-archive support.
-- Column is nullable with no default; existing rows stay unarchived (NULL).
-- Partial indexes on (owner_id) WHERE archived_at IS NULL cover the picker hot path.

ALTER TABLE public.topics
  ADD COLUMN archived_at timestamptz NULL;

ALTER TABLE public.material_formats
  ADD COLUMN archived_at timestamptz NULL;

CREATE INDEX topics_owner_id_active_idx
  ON public.topics (owner_id)
  WHERE archived_at IS NULL;

CREATE INDEX material_formats_owner_id_active_idx
  ON public.material_formats (owner_id)
  WHERE archived_at IS NULL;

-- Grant table-level privileges so the `authenticated` and `anon` roles can
-- reach the RLS policies. Without these, PostgreSQL denies access before
-- RLS is even evaluated. `service_role` and `postgres` get all privileges
-- so the integration test service-role client and migrations work correctly.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.topics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_formats TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO authenticated;

-- anon gets full DML so RLS can evaluate and block at the policy layer (without
-- these grants, Postgres denies at privilege level which masks RLS coverage).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.topics TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_formats TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO anon;

GRANT ALL ON public.topics TO service_role, postgres;
GRANT ALL ON public.material_formats TO service_role, postgres;
GRANT ALL ON public.sessions TO service_role, postgres;
