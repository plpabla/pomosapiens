import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TopicSelect } from "@/components/session/CatalogSelects";

afterEach(() => {
  cleanup();
});

describe("TopicSelect", () => {
  it("shows the selected topic's name even though its item has never been opened/rendered before", () => {
    const topics = [{ id: "t1", name: "Deep Work", archived_at: null }];
    render(<TopicSelect value="t1" onChange={vi.fn()} topics={topics} />);

    expect(screen.getByRole("combobox", { name: "Topic" })).toHaveTextContent("Deep Work");
  });

  it("shows the name of a topic that is created and selected in the same update (inline-create case)", () => {
    const { rerender } = render(<TopicSelect value={null} onChange={vi.fn()} topics={[]} />);

    const newTopic = { id: "t2", name: "Writing code", archived_at: null };
    rerender(<TopicSelect value={newTopic.id} onChange={vi.fn()} topics={[newTopic]} />);

    expect(screen.getByRole("combobox", { name: "Topic" })).toHaveTextContent("Writing code");
  });
});
