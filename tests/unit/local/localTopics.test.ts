import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createLocalTopic, useLocalTopics, LOCAL_TOPICS_KEY } from "@/lib/local/localTopics";

describe("localTopics", () => {
  beforeEach(() => {
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: LOCAL_TOPICS_KEY }));
  });

  it("creates a topic with a UUID id, trimmed name, and null archived_at", () => {
    const topic = createLocalTopic("  Deep Work  ");
    expect(topic.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(topic.name).toBe("Deep Work");
    expect(topic.archived_at).toBeNull();
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(() => createLocalTopic("   ")).toThrow();
  });

  it("rejects a name over the 100-char limit", () => {
    expect(() => createLocalTopic("a".repeat(101))).toThrow();
  });

  it("rejects an exact-match duplicate name", () => {
    createLocalTopic("Reading");
    expect(() => createLocalTopic("Reading")).toThrow();
  });

  it("useLocalTopics re-renders when a topic is created", () => {
    const { result } = renderHook(() => useLocalTopics());
    expect(result.current).toHaveLength(0);
    act(() => {
      createLocalTopic("Writing");
    });
    expect(result.current).toHaveLength(1);
    expect(result.current[0].name).toBe("Writing");
  });
});
