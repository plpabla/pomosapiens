import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MaterialFormatManager } from "@/components/material-formats/MaterialFormatManager";

const FORMATS = [
  { id: "f1", name: "Video", owner_id: null, archived_at: null },
  { id: "f2", name: "Article", owner_id: "u1", archived_at: null },
  { id: "f3", name: "Podcast", owner_id: "u1", archived_at: "2026-01-01T00:00:00.000Z" },
];

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MaterialFormatManager", () => {
  it("shows the server error message when the load fails server-side", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ error: "Could not load formats" })),
    );
    render(<MaterialFormatManager />);

    expect(await screen.findByText("Could not load formats")).toBeInTheDocument();
  });

  it("shows a generic error when the fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down"))),
    );
    render(<MaterialFormatManager />);

    expect(await screen.findByText("Failed to load formats")).toBeInTheDocument();
  });

  it("shows a placeholder message when there are no owned formats", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ formats: [FORMATS[0]] })),
    );
    render(<MaterialFormatManager />);

    expect(await screen.findByText("Video")).toBeInTheDocument();
    expect(
      screen.getByText("Most users stick with the built-ins. Add a custom format if none of them fit."),
    ).toBeInTheDocument();
  });

  it("splits Built-in (read-only) from Yours (editable) and hides archived by default", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ formats: FORMATS })),
    );
    render(<MaterialFormatManager />);

    await screen.findByText("Video");
    expect(screen.getByText("Article")).toBeInTheDocument();
    expect(screen.queryByText("Podcast")).not.toBeInTheDocument();
    expect(screen.getAllByText("Built-in")).toHaveLength(2); // section heading + row badge
    expect(screen.getByText("Show archived (1)")).toBeInTheDocument();

    // Built-in row is read-only: exactly one Rename/Archive pair, belonging to "Article".
    expect(screen.getAllByRole("button", { name: "Rename" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Archive" })).toHaveLength(1);
  });

  it("reveals archived formats when the toggle is clicked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ formats: FORMATS })),
    );
    render(<MaterialFormatManager />);
    await screen.findByText("Video");

    fireEvent.click(screen.getByText("Show archived (1)"));

    expect(screen.getByText("Podcast")).toBeInTheDocument();
  });

  describe("add", () => {
    it("appends the new format under Yours on success", async () => {
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => jsonResponse({ formats: [FORMATS[0]] }))
        .mockImplementationOnce(() =>
          jsonResponse({ id: "f9", name: "New format", owner_id: "u1", archived_at: null }, 201),
        );
      vi.stubGlobal("fetch", fetchMock);

      render(<MaterialFormatManager />);
      await screen.findByText("Video");

      fireEvent.click(screen.getByRole("button", { name: "Add format" }));
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New format" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(screen.getByText("New format")).toBeInTheDocument();
      });
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/material-formats",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "New format" }) }),
      );
    });
  });

  describe("rename", () => {
    it("optimistically renames and keeps the new name on success", async () => {
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => jsonResponse({ formats: FORMATS }))
        .mockImplementationOnce(() => jsonResponse({ ok: true }));
      vi.stubGlobal("fetch", fetchMock);

      render(<MaterialFormatManager />);
      await screen.findByText("Article");

      fireEvent.click(screen.getByRole("button", { name: "Rename" }));
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Essay" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(screen.getByText("Essay")).toBeInTheDocument();

      await waitFor(() => {
        expect(fetchMock).toHaveBeenLastCalledWith(
          "/api/material-formats/f2",
          expect.objectContaining({ method: "PATCH", body: JSON.stringify({ name: "Essay" }) }),
        );
      });
    });

    it("rolls back to the previous name and shows an error on failure", async () => {
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => jsonResponse({ formats: FORMATS }))
        .mockImplementationOnce(() => jsonResponse({ error: "Server error" }, 500));
      vi.stubGlobal("fetch", fetchMock);

      render(<MaterialFormatManager />);
      await screen.findByText("Article");

      fireEvent.click(screen.getByRole("button", { name: "Rename" }));
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Essay" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await screen.findByText("Server error");
      expect(screen.getByText("Article")).toBeInTheDocument();
      expect(screen.queryByText("Essay")).not.toBeInTheDocument();
    });
  });

  describe("archive / unarchive", () => {
    it("optimistically moves the format out of Yours on archive success", async () => {
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => jsonResponse({ formats: FORMATS }))
        .mockImplementationOnce(() => jsonResponse({ ok: true }));
      vi.stubGlobal("fetch", fetchMock);

      render(<MaterialFormatManager />);
      await screen.findByText("Article");

      fireEvent.click(screen.getByRole("button", { name: "Archive" }));

      await waitFor(() => {
        expect(screen.queryByText("Article")).not.toBeInTheDocument();
      });
      expect(screen.getByText("Show archived (2)")).toBeInTheDocument();
      // Built-in row is untouched
      expect(screen.getByText("Video")).toBeInTheDocument();
    });

    it("rolls back and shows an error on archive failure", async () => {
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => jsonResponse({ formats: FORMATS }))
        .mockImplementationOnce(() => jsonResponse({ error: "Server error" }, 500));
      vi.stubGlobal("fetch", fetchMock);

      render(<MaterialFormatManager />);
      await screen.findByText("Article");

      fireEvent.click(screen.getByRole("button", { name: "Archive" }));

      await screen.findByText("Server error");
      expect(screen.getByText("Article")).toBeInTheDocument();
    });

    it("unarchives and moves the format back under Yours", async () => {
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => jsonResponse({ formats: FORMATS }))
        .mockImplementationOnce(() => jsonResponse({ ok: true }));
      vi.stubGlobal("fetch", fetchMock);

      render(<MaterialFormatManager />);
      await screen.findByText("Article");
      fireEvent.click(screen.getByText("Show archived (1)"));
      fireEvent.click(screen.getByRole("button", { name: "Unarchive" }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenLastCalledWith(
          "/api/material-formats/f3",
          expect.objectContaining({ method: "PATCH", body: JSON.stringify({ archived_at: null }) }),
        );
      });
      expect(screen.getAllByText("Podcast")).toHaveLength(1);
      expect(screen.queryByText(/archived \(/)).not.toBeInTheDocument();
    });
  });
});
