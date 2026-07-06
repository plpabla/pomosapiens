-- Reinstate owner-scoped DELETE on sessions, reversing 20260601120000_drop_sessions_delete_policy.sql.
-- An explicit, user-initiated abandon flow now exists (roadmap S-05); per user decision, DELETE is
-- fully open (owner can delete any of their own sessions, ended or not), not scoped to in-progress rows.
-- See context/changes/explicit-session-abandon/plan.md and context/foundation/lessons.md L-06.

CREATE POLICY sessions_delete_own ON public.sessions
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
