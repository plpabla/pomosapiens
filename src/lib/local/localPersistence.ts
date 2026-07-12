import type { SessionPersistence } from "@/lib/session/persistence";
import { createLocalSession, endLocalSession } from "@/lib/local/localSessions";

export const localPersistence: SessionPersistence = {
  createSession(input) {
    const row = createLocalSession(input);
    return Promise.resolve({ id: row.id, startedAtMs: Date.parse(row.started_at) });
  },
  endSession(id, args) {
    endLocalSession(id, args);
    return Promise.resolve();
  },
};
