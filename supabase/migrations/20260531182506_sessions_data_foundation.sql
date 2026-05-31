-- Migration: sessions_data_foundation (F-01)
-- Creates the first application schema: material_formats, topics, sessions.
-- Anticipating-but-nullable: columns required by S-02/S-03/S-04 ship now as nullable.
-- RLS is enabled in a follow-up block appended to this same migration file.

-- ---------------------------------------------------------------------------
-- 1. Enum type
-- ---------------------------------------------------------------------------

CREATE TYPE public.energy_level AS ENUM ('low', 'medium', 'high');

-- ---------------------------------------------------------------------------
-- 2. Trigger function: keep updated_at in sync on UPDATE
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. material_formats: per-user lookup with NULL-owner defaults
-- ---------------------------------------------------------------------------

CREATE TABLE public.material_formats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);

-- Postgres treats NULLs in UNIQUE as distinct, so the composite UNIQUE does
-- not stop two seeded defaults sharing a name. Partial unique index closes it.
CREATE UNIQUE INDEX material_formats_default_name_uidx
  ON public.material_formats (name)
  WHERE owner_id IS NULL;

CREATE INDEX material_formats_owner_id_idx
  ON public.material_formats (owner_id);

CREATE TRIGGER material_formats_set_updated_at
  BEFORE UPDATE ON public.material_formats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. topics: per-user lookup; ships empty (S-02 owns first-row UX)
-- ---------------------------------------------------------------------------

CREATE TABLE public.topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);

CREATE UNIQUE INDEX topics_default_name_uidx
  ON public.topics (name)
  WHERE owner_id IS NULL;

CREATE INDEX topics_owner_id_idx
  ON public.topics (owner_id);

CREATE TRIGGER topics_set_updated_at
  BEFORE UPDATE ON public.topics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. sessions
-- ---------------------------------------------------------------------------

CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NULL,
  duration_seconds integer GENERATED ALWAYS AS (
    CASE
      WHEN ended_at IS NULL THEN NULL
      ELSE EXTRACT(EPOCH FROM (ended_at - started_at))::int
    END
  ) STORED,
  energy_level public.energy_level NOT NULL,
  focus_rating smallint NULL CHECK (focus_rating BETWEEN 1 AND 5),
  topic_id uuid NULL REFERENCES public.topics(id) ON DELETE SET NULL,
  material_format_id uuid NULL REFERENCES public.material_formats(id) ON DELETE SET NULL,
  timer_mode text NULL CHECK (
    timer_mode IS NULL
    OR timer_mode IN ('preset_1', 'preset_2', 'preset_3', 'count_up')
  ),
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_started_at_idx
  ON public.sessions (user_id, started_at DESC);

CREATE TRIGGER sessions_set_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Seed default material_formats (owner_id NULL = visible to every user)
-- ---------------------------------------------------------------------------

INSERT INTO public.material_formats (owner_id, name) VALUES
  (NULL, 'Video'),
  (NULL, 'Reading'),
  (NULL, 'Writing code'),
  (NULL, 'Drilling problems'),
  (NULL, 'Other');

-- ---------------------------------------------------------------------------
-- 7. Row Level Security
-- Every table: RLS on + 4 per-operation policies scoped to `authenticated`.
-- `anon` gets no policy and is fully denied by default.
-- `(SELECT auth.uid())` form used throughout — Postgres caches the result
-- per query (Supabase-recommended performance pattern).
-- ---------------------------------------------------------------------------

-- sessions ----------------------------------------------------------------

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sessions_select_own ON public.sessions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY sessions_insert_own ON public.sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY sessions_update_own ON public.sessions
  FOR UPDATE TO authenticated
  USING  (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY sessions_delete_own ON public.sessions
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- topics ------------------------------------------------------------------

ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY topics_select_own_or_default ON public.topics
  FOR SELECT TO authenticated
  USING (owner_id IS NULL OR owner_id = (SELECT auth.uid()));

CREATE POLICY topics_insert_own ON public.topics
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY topics_update_own ON public.topics
  FOR UPDATE TO authenticated
  USING  (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY topics_delete_own ON public.topics
  FOR DELETE TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- material_formats --------------------------------------------------------

ALTER TABLE public.material_formats ENABLE ROW LEVEL SECURITY;

CREATE POLICY material_formats_select_own_or_default ON public.material_formats
  FOR SELECT TO authenticated
  USING (owner_id IS NULL OR owner_id = (SELECT auth.uid()));

CREATE POLICY material_formats_insert_own ON public.material_formats
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY material_formats_update_own ON public.material_formats
  FOR UPDATE TO authenticated
  USING  (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY material_formats_delete_own ON public.material_formats
  FOR DELETE TO authenticated
  USING (owner_id = (SELECT auth.uid()));
