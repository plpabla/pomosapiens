-- Align RLS policy operand order with sibling tables (sessions, topics,
-- material_formats all use `user_id = (SELECT auth.uid())`).
-- Semantically identical; corrected for visual consistency in Supabase Studio.

DROP POLICY IF EXISTS "user_presets_select_own" ON public.user_presets;
DROP POLICY IF EXISTS "user_presets_insert_own" ON public.user_presets;
DROP POLICY IF EXISTS "user_presets_update_own" ON public.user_presets;

CREATE POLICY user_presets_select_own ON public.user_presets
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY user_presets_insert_own ON public.user_presets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY user_presets_update_own ON public.user_presets
  FOR UPDATE TO authenticated
  USING  (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
