import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import AbandonButton from "@/components/dashboard/AbandonButton";

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

describe("AbandonButton", () => {
  it("renders the Abandon button initially", () => {
    render(<AbandonButton sessionId="s1" />);

    expect(screen.getByRole("button", { name: "Abandon" })).toBeInTheDocument();
  });

  it("shows Confirm?/Cancel after clicking Abandon, without calling fetch", () => {
    render(<AbandonButton sessionId="s1" />);

    fireEvent.click(screen.getByRole("button", { name: "Abandon" }));

    expect(screen.getByRole("button", { name: "Confirm?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns to Abandon when Cancel is clicked", () => {
    render(<AbandonButton sessionId="s1" />);

    fireEvent.click(screen.getByRole("button", { name: "Abandon" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Abandon" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls DELETE on the session endpoint when Confirm? is clicked", async () => {
    render(<AbandonButton sessionId="s1" />);

    fireEvent.click(screen.getByRole("button", { name: "Abandon" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm?" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/sessions/s1", expect.objectContaining({ method: "DELETE" }));
    });
  });

  it("reloads the page on a successful delete", async () => {
    render(<AbandonButton sessionId="s1" />);

    fireEvent.click(screen.getByRole("button", { name: "Abandon" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm?" }));

    await waitFor(() => {
      expect(reload).toHaveBeenCalled();
    });
  });

  it("shows an error and returns to idle when the delete fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Session not found" }), { status: 404 })),
    );

    render(<AbandonButton sessionId="s1" />);

    fireEvent.click(screen.getByRole("button", { name: "Abandon" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm?" }));

    await waitFor(() => {
      expect(screen.getByText("Session not found")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Abandon" })).toBeInTheDocument();
  });
});
