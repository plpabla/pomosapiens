-- Migration: user_presets_and_session_audit_cols (S-03 Phase 1)
-- Creates user_presets table (three editable focus+break preset slots per user)
-- and adds planned_focus_seconds / planned_break_seconds audit columns to sessions.

-- ---------------------------------------------------------------------------
-- 1. user_presets table
-- ---------------------------------------------------------------------------

CREATE TABLE public.user_presets (
  id            uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot          smallint  NOT NULL CHECK (slot IN (1, 2, 3)),
  focus_seconds integer   NOT NULL CHECK (focus_seconds BETWEEN 60 AND 4 * 60 * 60),
  break_seconds integer   NOT NULL CHECK (break_seconds BETWEEN 0 AND 60 * 60),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slot)
);

CREATE INDEX user_presets_user_id_idx ON public.user_presets (user_id);

CREATE TRIGGER user_presets_set_updated_at
  BEFORE UPDATE ON public.user_presets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. RLS for user_presets
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_presets_select_own ON public.user_presets
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY user_presets_insert_own ON public.user_presets
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY user_presets_update_own ON public.user_presets
  FOR UPDATE TO authenticated
  USING  ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY user_presets_delete_own ON public.user_presets
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. Grants for user_presets
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_presets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_presets TO anon;
GRANT ALL ON public.user_presets TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- 4. Sessions audit columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.sessions
  ADD COLUMN planned_focus_seconds integer NULL
    CHECK (planned_focus_seconds IS NULL OR planned_focus_seconds BETWEEN 60 AND 4 * 60 * 60);

ALTER TABLE public.sessions
  ADD COLUMN planned_break_seconds integer NULL
    CHECK (planned_break_seconds IS NULL OR planned_break_seconds BETWEEN 0 AND 60 * 60);
