import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { vi, beforeEach, afterEach, describe, it, expect } from "vitest";
import PresetManager from "@/components/presets/PresetManager";

const DEFAULT_PRESETS = [
  { slot: 1, focus_seconds: 1500, break_seconds: 300 },
  { slot: 2, focus_seconds: 2700, break_seconds: 600 },
  { slot: 3, focus_seconds: 5400, break_seconds: 900 },
];

function makeGetResponse() {
  return new Response(JSON.stringify({ presets: DEFAULT_PRESETS }), { status: 200 });
}

describe("PresetManager", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe("initial render", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() => Promise.resolve(makeGetResponse())),
      );
    });

    it("shows three Save buttons after loading presets", async () => {
      render(<PresetManager />);
      const saves = await screen.findAllByRole("button", { name: /save/i });
      expect(saves).toHaveLength(3);
    });

    it("Save buttons are disabled when no row has been changed", async () => {
      render(<PresetManager />);
      const saves = await screen.findAllByRole("button", { name: /save/i });
      saves.forEach((btn) => expect(btn).toBeDisabled());
    });

    it("Save button becomes enabled after editing an input", async () => {
      render(<PresetManager />);
      await screen.findAllByRole("button", { name: /save/i });

      const focusInputs = screen.getAllByLabelText(/focus/i);
      fireEvent.change(focusInputs[0], { target: { value: "30" } });

      const saves = screen.getAllByRole("button", { name: /save/i });
      expect(saves[0]).toBeEnabled();
      // Other rows unchanged -- still disabled
      expect(saves[1]).toBeDisabled();
      expect(saves[2]).toBeDisabled();
    });
  });

  describe("saving a row", () => {
    it("sends focus_seconds and break_seconds as seconds (not minutes) to PUT endpoint", async () => {
      const putBody = { slot: 1, focus_seconds: 1800, break_seconds: 300 };
      const mockFetch = vi
        .fn()
        .mockImplementationOnce(() => Promise.resolve(makeGetResponse()))
        .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify(putBody), { status: 200 })));
      vi.stubGlobal("fetch", mockFetch);

      render(<PresetManager />);
      await screen.findAllByRole("button", { name: /save/i });

      const focusInputs = screen.getAllByLabelText(/focus/i);
      fireEvent.change(focusInputs[0], { target: { value: "30" } });
      fireEvent.click(screen.getAllByRole("button", { name: /save/i })[0]);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/user-presets/1",
          expect.objectContaining({
            method: "PUT",
            body: JSON.stringify({ focus_seconds: 30 * 60, break_seconds: 300 }),
          }),
        );
      });
    });
  });

  describe("server error handling", () => {
    it("shows inline error for the failing row without disrupting other rows", async () => {
      const mockFetch = vi
        .fn()
        .mockImplementationOnce(() => Promise.resolve(makeGetResponse()))
        .mockImplementationOnce(() =>
          Promise.resolve(new Response(JSON.stringify({ error: "Server error" }), { status: 500 })),
        );
      vi.stubGlobal("fetch", mockFetch);

      render(<PresetManager />);
      await screen.findAllByRole("button", { name: /save/i });

      const focusInputs = screen.getAllByLabelText(/focus/i);
      fireEvent.change(focusInputs[0], { target: { value: "30" } });
      fireEvent.click(screen.getAllByRole("button", { name: /save/i })[0]);

      await screen.findByText(/server error/i);
      // All three rows still present
      expect(screen.getAllByRole("button", { name: /save/i })).toHaveLength(3);
    });
  });
});
