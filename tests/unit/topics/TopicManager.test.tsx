import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { TopicManager } from "@/components/topics/TopicManager";

const TOPICS = [
  { id: "t1", name: "Reading", archived_at: null },
  { id: "t2", name: "Writing", archived_at: "2026-01-01T00:00:00.000Z" },
];

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TopicManager", () => {
  it("shows the server error message when the load fails server-side", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ error: "Could not load topics" })),
    );
    render(<TopicManager />);

    expect(await screen.findByText("Could not load topics")).toBeInTheDocument();
  });

  it("shows a generic error when the fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down"))),
    );
    render(<TopicManager />);

    expect(await screen.findByText("Failed to load topics")).toBeInTheDocument();
  });

  it("shows the empty state when there are no topics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ topics: [] })),
    );
    render(<TopicManager />);

    expect(await screen.findByText("No topics yet")).toBeInTheDocument();
  });

  it("renders active topics and hides archived ones by default", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ topics: TOPICS })),
    );
    render(<TopicManager />);

    expect(await screen.findByText("Reading")).toBeInTheDocument();
    expect(screen.queryByText("Writing")).not.toBeInTheDocument();
    expect(screen.getByText("Show archived (1)")).toBeInTheDocument();
  });

  it("reveals archived topics when the toggle is clicked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ topics: TOPICS })),
    );
    render(<TopicManager />);
    await screen.findByText("Reading");

    fireEvent.click(screen.getByText("Show archived (1)"));

    expect(screen.getByText("Writing")).toBeInTheDocument();
    expect(screen.getByText("Hide archived (1)")).toBeInTheDocument();
  });

  describe("add", () => {
    it("appends the new topic on success and closes the dialog", async () => {
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => jsonResponse({ topics: [] }))
        .mockImplementationOnce(() => jsonResponse({ id: "t9", name: "New topic", archived_at: null }, 201));
      vi.stubGlobal("fetch", fetchMock);

      render(<TopicManager />);
      await screen.findByText("No topics yet");

      fireEvent.click(screen.getByRole("button", { name: "Add topic" }));
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New topic" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(screen.getByText("New topic")).toBeInTheDocument();
      });
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/topics",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "New topic" }) }),
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("shows an error inside the dialog and keeps it open on failure", async () => {
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => jsonResponse({ topics: [] }))
        .mockImplementationOnce(() => jsonResponse({ error: "A topic with that name already exists" }, 409));
      vi.stubGlobal("fetch", fetchMock);

      render(<TopicManager />);
      await screen.findByText("No topics yet");

      fireEvent.click(screen.getByRole("button", { name: "Add topic" }));
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Reading" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByText("A topic with that name already exists")).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  describe("rename", () => {
    it("optimistically renames and keeps the new name on success", async () => {
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => jsonResponse({ topics: TOPICS }))
        .mockImplementationOnce(() => jsonResponse({ ok: true }));
      vi.stubGlobal("fetch", fetchMock);

      render(<TopicManager />);
      await screen.findByText("Reading");

      fireEvent.click(screen.getByRole("button", { name: "Rename" }));
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Deep reading" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(screen.getByText("Deep reading")).toBeInTheDocument();

      await waitFor(() => {
        expect(fetchMock).toHaveBeenLastCalledWith(
          "/api/topics/t1",
          expect.objectContaining({ method: "PATCH", body: JSON.stringify({ name: "Deep reading" }) }),
        );
      });
    });

    it("rolls back to the previous name and shows an error on failure", async () => {
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => jsonResponse({ topics: TOPICS }))
        .mockImplementationOnce(() => jsonResponse({ error: "Server error" }, 500));
      vi.stubGlobal("fetch", fetchMock);

      render(<TopicManager />);
      await screen.findByText("Reading");

      fireEvent.click(screen.getByRole("button", { name: "Rename" }));
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Deep reading" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await screen.findByText("Server error");
      expect(screen.getByText("Reading")).toBeInTheDocument();
      expect(screen.queryByText("Deep reading")).not.toBeInTheDocument();
    });
  });

  describe("archive / unarchive", () => {
    it("optimistically removes the topic from the active list on success", async () => {
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => jsonResponse({ topics: TOPICS }))
        .mockImplementationOnce(() => jsonResponse({ ok: true }));
      vi.stubGlobal("fetch", fetchMock);

      render(<TopicManager />);
      await screen.findByText("Reading");

      fireEvent.click(screen.getByRole("button", { name: "Archive" }));

      await waitFor(() => {
        expect(screen.queryByText("Reading")).not.toBeInTheDocument();
      });
      expect(screen.getByText("Show archived (2)")).toBeInTheDocument();
    });

    it("rolls back and shows an error on archive failure", async () => {
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => jsonResponse({ topics: TOPICS }))
        .mockImplementationOnce(() => jsonResponse({ error: "Server error" }, 500));
      vi.stubGlobal("fetch", fetchMock);

      render(<TopicManager />);
      await screen.findByText("Reading");

      fireEvent.click(screen.getByRole("button", { name: "Archive" }));

      await screen.findByText("Server error");
      expect(screen.getByText("Reading")).toBeInTheDocument();
    });

    it("unarchives and moves the topic back into the active list", async () => {
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => jsonResponse({ topics: TOPICS }))
        .mockImplementationOnce(() => jsonResponse({ ok: true }));
      vi.stubGlobal("fetch", fetchMock);

      render(<TopicManager />);
      await screen.findByText("Reading");
      fireEvent.click(screen.getByText("Show archived (1)"));
      fireEvent.click(screen.getByRole("button", { name: "Unarchive" }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenLastCalledWith(
          "/api/topics/t2",
          expect.objectContaining({ method: "PATCH", body: JSON.stringify({ archived_at: null }) }),
        );
      });
      expect(screen.getAllByText("Writing")).toHaveLength(1);
      expect(screen.queryByText(/archived \(/)).not.toBeInTheDocument();
    });
  });
});
