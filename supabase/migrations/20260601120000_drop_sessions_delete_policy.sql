-- Enforce session immutability at the DB layer: remove the user-facing DELETE policy.
-- PRD treats sessions as immutable history; FR-017 specifies archive, not delete.
-- Owner-side deletion via the REST API is now denied; auth.users cascade still removes rows.
-- Lesson reference: context/foundation/lessons.md — "RLS policies must enforce business-rule immutability, not the UI".

DROP POLICY IF EXISTS sessions_delete_own ON public.sessions;
