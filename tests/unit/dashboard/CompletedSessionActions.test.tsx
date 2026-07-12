import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import CompletedSessionActions from "@/components/dashboard/CompletedSessionActions";

const reload = vi.fn();
Object.defineProperty(window, "location", {
  value: { reload },
  writable: true,
});

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
  reload.mockClear();
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
  it("keeps Edit and Delete hidden until the actions menu is opened", () => {
    render(<CompletedSessionActions {...baseProps} />);

    expect(screen.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();

    // Radix's DropdownMenuTrigger opens on pointerdown, not click.
    fireEvent.pointerDown(screen.getByRole("button", { name: /more actions/i }));

    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });

  it("gates the Delete menu item behind a confirm dialog and does not delete on open", () => {
    render(<CompletedSessionActions {...baseProps} />);

    // Radix's DropdownMenuTrigger opens on pointerdown, not click.
    fireEvent.pointerDown(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/delete session\?/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith("/api/sessions/s1", expect.objectContaining({ method: "DELETE" }));
  });

  it("issues DELETE and reloads when the confirm dialog is confirmed", async () => {
    render(<CompletedSessionActions {...baseProps} />);

    // Radix's DropdownMenuTrigger opens on pointerdown, not click.
    fireEvent.pointerDown(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/sessions/s1", expect.objectContaining({ method: "DELETE" }));
    });
    await waitFor(() => {
      expect(reload).toHaveBeenCalled();
    });
  });
});
