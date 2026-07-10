import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CompletedSessionActions from "@/components/dashboard/CompletedSessionActions";

const baseProps = {
  id: "s1",
  startedAt: "2026-07-01T10:00:00.000Z",
  durationSeconds: 1500,
  energyLevel: "high" as const,
  topicId: null as string | null,
  materialFormatId: null as string | null,
  focusRating: null as number | null,
  note: null as string | null,
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const body = url.includes("topics") ? { topics: [] } : { formats: [] };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("CompletedSessionActions", () => {
  it("renders both Edit and Delete controls initially", () => {
    render(<CompletedSessionActions {...baseProps} />);

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("hides the Edit button while the delete confirmation is showing", () => {
    render(<CompletedSessionActions {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm?" })).toBeInTheDocument();
  });

  it("shows the Edit button again after the delete confirmation is cancelled", () => {
    render(<CompletedSessionActions {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});
