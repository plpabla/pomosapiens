-- user_presets has no DELETE endpoint; presets are permanent (only editable).
-- Drop the policy added by the initial migration to restore schema-level
-- friction against accidental deletion.
DROP POLICY IF EXISTS "user_presets_delete_own" ON user_presets;
