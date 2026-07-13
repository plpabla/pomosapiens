import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ResumeButton from "@/components/dashboard/ResumeButton";

const assign = vi.fn();
Object.defineProperty(window, "location", {
  value: { assign },
  writable: true,
});

beforeEach(() => {
  assign.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("ResumeButton", () => {
  it("renders a button with the accessible name Resume", () => {
    render(<ResumeButton sessionId="s1" />);

    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });

  it("navigates to the session page when clicked", () => {
    render(<ResumeButton sessionId="s1" />);

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));

    expect(assign).toHaveBeenCalledWith("/session/s1");
  });
});
