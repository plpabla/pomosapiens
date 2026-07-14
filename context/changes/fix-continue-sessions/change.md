---
change_id: fix-continue-sessions
title: Preserve break time when user continues session
status: impl_reviewed
created: 2026-07-14
updated: 2026-07-14
archived_at: null
---

## Notes

When user decides to continue the sesison, then, based on `continue-session-past-end` slice, original session time and break time are set to NULL. This decision was not great - as right now the user after prolonging the session for e.g. extra 5 minutes, looses his break, so the better option would be to keep it.

Also, for using preset mode, after the break, user should be not redirected to the dashboard, but to the /session/new with preset values the same as for previous session (time preset, but also energy level, topic and format)
