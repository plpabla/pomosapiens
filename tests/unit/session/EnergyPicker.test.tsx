// Pins context/foundation/test-plan.md S2 Risk #7 (picker fetch silent failure)
import { render, screen, cleanup } from "@testing-library/react";
import { vi, beforeEach, afterEach, describe, it, expect } from "vitest";
import EnergyPicker from "@/components/session/EnergyPicker";

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
