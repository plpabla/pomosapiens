import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import EditSessionDialog from "@/components/dashboard/EditSessionDialog";

const reload = vi.fn();
Object.defineProperty(window, "location", {
  value: { reload },
  writable: true,
});

// Routes topic/format loads to empty lists; captures the PUT for assertions.
function stubFetch() {
  return vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }
    const body = url.includes("topics") ? { topics: [] } : { formats: [] };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
}

const baseProps = {
  id: "s1",
  startedAt: "2026-07-01T10:00:00.000Z",
  durationSeconds: 1500,
  energyLevel: "high" as const,
  topicId: "t1" as string | null,
  materialFormatId: "f1" as string | null,
  focusRating: 3 as number | null,
  note: "hi" as string | null,
};

function lastPutBody(fetchMock: ReturnType<typeof stubFetch>) {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
  const body = call?.[1]?.body;
  if (typeof body !== "string") throw new Error("no PUT call recorded");
  return JSON.parse(body) as Record<string, unknown>;
}

beforeEach(() => {
  reload.mockClear();
  vi.stubGlobal("fetch", stubFetch());
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("EditSessionDialog", () => {
  it("renders an Edit trigger and opens a dialog pre-filled with current values", async () => {
    render(<EditSessionDialog {...baseProps} durationSeconds={90} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    // 90s → 2 min displayed; note pre-filled; pickers fetched
    expect(await screen.findByLabelText(/duration/i)).toHaveValue(2);
    expect(screen.getByLabelText(/note/i)).toHaveValue("hi");
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/topics");
      expect(fetch).toHaveBeenCalledWith("/api/material-formats");
    });
  });

  it("submits the original durationSeconds when the duration field is untouched (dirty-bit)", async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<EditSessionDialog {...baseProps} durationSeconds={90} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByLabelText(/duration/i);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/sessions/s1", expect.objectContaining({ method: "PUT" }));
    });
    const body = lastPutBody(fetchMock);
    expect(body.duration_seconds).toBe(90); // not 120 (2 min rounded)
    expect(body).toMatchObject({
      energy_level: "high",
      topic_id: "t1",
      material_format_id: "f1",
      focus_rating: 3,
      note: "hi",
    });
    await waitFor(() => {
      expect(reload).toHaveBeenCalled();
    });
  });

  it("submits minutes*60 when the duration field is edited", async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<EditSessionDialog {...baseProps} durationSeconds={1500} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const durationInput = await screen.findByLabelText(/duration/i);
    fireEvent.change(durationInput, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(lastPutBody(fetchMock).duration_seconds).toBe(600);
    });
  });

  it("keeps a sub-minute session's original duration when untouched (no rounding to 0)", async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<EditSessionDialog {...baseProps} durationSeconds={10} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByLabelText(/duration/i);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(lastPutBody(fetchMock).duration_seconds).toBe(10); // not 0
    });
  });

  it("surfaces a server error and does not reload when the PUT fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === "PUT") {
          return Promise.resolve(new Response(JSON.stringify({ error: "Session not found" }), { status: 404 }));
        }
        const body = url.includes("topics") ? { topics: [] } : { formats: [] };
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
      }),
    );
    render(<EditSessionDialog {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByLabelText(/duration/i);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText("Session not found")).toBeInTheDocument();
    });
    expect(reload).not.toHaveBeenCalled();
  });
});
