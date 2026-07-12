import { describe, it, expect } from "vitest";
import { toSessionListItems } from "@/lib/local/localSessionList";
import { LOCAL_DEFAULT_FORMATS } from "@/lib/local/localCatalog";
import type { LocalSession } from "@/lib/local/localSessions";
import type { Topic } from "@/lib/types";

const TOPIC: Topic = { id: "topic-1", name: "Deep Work", archived_at: null };
const FORMAT_ID = LOCAL_DEFAULT_FORMATS[0].id;

function makeSession(overrides: Partial<LocalSession>): LocalSession {
  return {
    id: "s-1",
    started_at: "2026-07-01T10:00:00.000Z",
    ended_at: "2026-07-01T10:25:00.000Z",
    energy_level: "medium",
    focus_rating: 4,
    note: null,
    topic_id: null,
    material_format_id: null,
    timer_mode: "preset_1",
    planned_focus_seconds: 25 * 60,
    planned_break_seconds: 5 * 60,
    ...overrides,
  };
}

describe("toSessionListItems", () => {
  it("computes duration_seconds from started_at/ended_at", () => {
    const [item] = toSessionListItems([makeSession({})], []);
    expect(item.duration_seconds).toBe(25 * 60);
  });

  it("leaves duration_seconds null while a session is in progress", () => {
    const [item] = toSessionListItems([makeSession({ ended_at: null })], []);
    expect(item.duration_seconds).toBeNull();
  });

  it("resolves topic name from the topics store by id", () => {
    const [item] = toSessionListItems([makeSession({ topic_id: TOPIC.id })], [TOPIC]);
    expect(item.topic).toEqual({ name: "Deep Work" });
  });

  it("returns null topic when topic_id is null", () => {
    const [item] = toSessionListItems([makeSession({ topic_id: null })], [TOPIC]);
    expect(item.topic).toBeNull();
  });

  it("resolves material_format name from LOCAL_DEFAULT_FORMATS by id", () => {
    const [item] = toSessionListItems([makeSession({ material_format_id: FORMAT_ID })], []);
    expect(item.material_format).toEqual({ name: LOCAL_DEFAULT_FORMATS[0].name });
  });

  it("sorts sessions by started_at descending", () => {
    const older = makeSession({ id: "old", started_at: "2026-07-01T09:00:00.000Z" });
    const newer = makeSession({ id: "new", started_at: "2026-07-01T11:00:00.000Z" });
    const items = toSessionListItems([older, newer], []);
    expect(items.map((i) => i.id)).toEqual(["new", "old"]);
  });
});
