import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import DeleteSessionButton from "@/components/dashboard/DeleteSessionButton";

const reload = vi.fn();
Object.defineProperty(window, "location", {
  value: { reload },
  writable: true,
});

beforeEach(() => {
  reload.mockClear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("DeleteSessionButton", () => {
  it("renders the Delete button initially", () => {
    render(<DeleteSessionButton sessionId="s1" />);

    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("shows Confirm?/Cancel after clicking Delete, without calling fetch", () => {
    render(<DeleteSessionButton sessionId="s1" />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("button", { name: "Confirm?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns to Delete when Cancel is clicked", () => {
    render(<DeleteSessionButton sessionId="s1" />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls DELETE on the session endpoint when Confirm? is clicked", async () => {
    render(<DeleteSessionButton sessionId="s1" />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm?" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/sessions/s1", expect.objectContaining({ method: "DELETE" }));
    });
  });

  it("reloads the page on a successful delete", async () => {
    render(<DeleteSessionButton sessionId="s1" />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm?" }));

    await waitFor(() => {
      expect(reload).toHaveBeenCalled();
    });
  });

  it("reports each phase transition via onPhaseChange", async () => {
    const onPhaseChange = vi.fn();
    render(<DeleteSessionButton sessionId="s1" onPhaseChange={onPhaseChange} />);

    expect(onPhaseChange).toHaveBeenCalledWith("idle");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onPhaseChange).toHaveBeenCalledWith("confirming");

    fireEvent.click(screen.getByRole("button", { name: "Confirm?" }));
    expect(onPhaseChange).toHaveBeenCalledWith("submitting");

    await waitFor(() => {
      expect(reload).toHaveBeenCalled();
    });
  });

  it("shows an error and returns to idle when the delete fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Session not found" }), { status: 404 })),
    );

    render(<DeleteSessionButton sessionId="s1" />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm?" }));

    await waitFor(() => {
      expect(screen.getByText("Session not found")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});
