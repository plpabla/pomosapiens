---
change_id: continue-session-past-end
title: Continue session past its scheduled end
status: archived
created: 2026-07-13
updated: 2026-07-13
archived_at: 2026-07-13T19:29:41Z
---

## Notes

Roadmap slice S-10 (`context/foundation/roadmap.md`).

Outcome: When a preset session reaches its scheduled end (focus phase completes and the auto focus→break transition, or the timer, would normally fire), the user can tap "I'm still working" / "Continue" instead of stopping. The session converts to count-up mode and keeps running from its original `started_at` (elapsed time is preserved, not reset), so the user is not forced out of flow state at an arbitrary preset boundary. When they eventually do stop, the normal end-of-session flow (rating, note, history) applies as usual, and the session is recorded as having run in count-up mode for its total elapsed duration.

Prerequisites: S-03 (count-up mode must exist — this slice converts a running preset session into one). PRD refs: extends FR-011 (auto focus→break transition) and FR-005 (count-up mode).

Open unknowns (decide at plan time):

- Trigger point — does "Continue" appear only at the moment the focus phase would auto-transition to break, or also at break-end, or as a persistent option throughout the running timer? => This appear **only at the focus end** phase (not all the time, nor for the break)
- Whether the audible end-of-focus cue (S-01) still fires when "Continue" is available, so the decision point is noticeable. ==> Audio is triggered at the focus section end as it is now. When user selects to continue, we will have count-up mode and for that, when Stop is pressed, there is no chime.
- History / dashboard display — how a session that started as a preset and converted to count-up mid-flight should be labeled (does the 🍅 badge / duration display reflect the original preset or the final count-up total?). ==> Badge and duration reflects final count-up total time
- Whether "Continue" is offered on break-phase end too, or focus-phase end only. ==> focus phase only

Risk: touches the core timer state machine established in S-01 and extended by S-03's count-up mode. The main hazard is a session's `timer_mode` changing mid-flight — any code that assumes a session's mode is fixed for its lifetime (save logic, S-05's abandon flow, S-06's tab-title timer) needs re-checking against this new transition. Must not break the existing auto focus→break transition or explicit stop-early/abandon paths for sessions that don't use "Continue".
