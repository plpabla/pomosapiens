import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import SessionTags from "@/components/session/SessionTags";
import type { SessionListItem } from "@/lib/types";

afterEach(() => {
  cleanup();
});

type TagsSession = Pick<SessionListItem, "topic" | "material_format">;

describe("SessionTags", () => {
  it("renders nothing when topic and material_format are both null", () => {
    const session: TagsSession = { topic: null, material_format: null };
    const { container } = render(<SessionTags session={session} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders topic and material_format chips when present", () => {
    const session: TagsSession = {
      topic: { name: "Algebra" },
      material_format: { name: "Book" },
    };
    render(<SessionTags session={session} />);
    expect(screen.getByText("Algebra")).toBeInTheDocument();
    expect(screen.getByText("Book")).toBeInTheDocument();
  });
});
