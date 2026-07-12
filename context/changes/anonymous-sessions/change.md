---
change_id: anonymous-sessions
title: Anonymous session capture backed by localStorage
status: implementing
created: 2026-07-11
updated: 2026-07-12
archived_at: null
---

## Notes

S-08 from @context/foundation/roadmap.md

**Scope split (2026-07-11, via `/10x-frame`):** this change covers slice A only —
anonymous, localStorage-backed session capture with topic/material-format
tagging and preset selection (sessions, topics, material_formats, user_presets
all mirrored locally). It does **not** include syncing/merging local data into
a Supabase account after sign-in/sign-up — that is split into a separate
slice, `S-09` / change-id `anonymous-session-sync`, per
`context/changes/anonymous-sessions/frame.md`.
