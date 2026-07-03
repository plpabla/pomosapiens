// Pins context/foundation/test-plan.md S2 Risk #7 (picker fetch silent failure)
// and bug 9.1 (mode initialisation must be SSR-safe — no localStorage on first render)
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { vi, beforeEach, afterEach, describe, it, expect } from "vitest";
import EnergyPicker from "@/components/session/EnergyPicker";

const MOCK_PRESETS = [
  { slot: 1, focus_seconds: 1500, break_seconds: 300 },
  { slot: 2, focus_seconds: 2700, break_seconds: 600 },
  { slot: 3, focus_seconds: 5400, break_seconds: 900 },
];

function stubFetchOk() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const body = url.includes("topics")
        ? { topics: [] }
        : url.includes("material-formats")
          ? { formats: [] }
          : { presets: MOCK_PRESETS };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }),
  );
}

describe("EnergyPicker -- mode init (bug 9.1 regression)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("shows last-used mode from localStorage on mount", async () => {
    localStorage.setItem("pomosapiens.last_mode", "preset_2");
    stubFetchOk();
    render(<EnergyPicker />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /P2/i })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: /P1/i })).toHaveAttribute("aria-pressed", "false");
    });
  });

  it("clicking a chip deselects the previous chip and persists the new mode to localStorage", async () => {
    // This pins the bug: state was already 'preset_2' from localStorage but DOM showed P1 (SSR),
    // so clicking P2 was a no-op — DOM never updated.
    // The fix (useSyncExternalStore + persistMode) writes to localStorage on every click,
    // which triggers a fresh snapshot read and re-render.
    localStorage.setItem("pomosapiens.last_mode", "preset_2");
    stubFetchOk();
    render(<EnergyPicker />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /P2/i })).toHaveAttribute("aria-pressed", "true");
    });
    fireEvent.click(screen.getByRole("button", { name: /P1/i }));
    expect(screen.getByRole("button", { name: /P1/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /P2/i })).toHaveAttribute("aria-pressed", "false");
    expect(localStorage.getItem("pomosapiens.last_mode")).toBe("preset_1");
  });
});

describe("EnergyPicker -- picker-init fetch failure (Risk #7)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe("network rejection", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    });

    it("shows load-error notice and keeps energy buttons rendered", async () => {
      render(<EnergyPicker />);
      await screen.findByText(/Could not load topics and formats/i);
      expect(screen.getByRole("button", { name: "Medium" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /start/i })).toBeInTheDocument();
    });
  });

  describe("401 with error envelope", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })),
      );
    });

    it("shows load-error notice and keeps energy buttons rendered", async () => {
      render(<EnergyPicker />);
      await screen.findByText(/Could not load topics and formats/i);
      expect(screen.getByRole("button", { name: "Medium" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /start/i })).toBeInTheDocument();
    });
  });
});
