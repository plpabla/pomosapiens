import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { vi, afterEach, describe, it, expect } from "vitest";
import { useState } from "react";
import ModePicker from "@/components/session/ModePicker";

type Mode = "preset_1" | "preset_2" | "preset_3" | "count_up";

function ControlledModePicker({ initialValue }: { initialValue: Mode }) {
  const [value, setValue] = useState<Mode>(initialValue);
  return <ModePicker presets={PRESETS} value={value} onChange={setValue} />;
}

const PRESETS = [
  { slot: 1 as const, focus_seconds: 1500, break_seconds: 300 },
  { slot: 2 as const, focus_seconds: 2700, break_seconds: 600 },
  { slot: 3 as const, focus_seconds: 5400, break_seconds: 900 },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ModePicker", () => {
  it("renders four chips: three presets and count-up", () => {
    render(<ModePicker presets={PRESETS} value="preset_1" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "25 / 5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "45 / 10" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "90 / 15" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Count-up/i })).toBeInTheDocument();
  });

  it("shows focus/break minutes in preset chip labels (25/5, 45/10, 90/15)", () => {
    render(<ModePicker presets={PRESETS} value="preset_1" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "25 / 5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "45 / 10" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "90 / 15" })).toBeInTheDocument();
  });

  it("marks the selected chip with aria-pressed=true, others false", () => {
    render(<ModePicker presets={PRESETS} value="preset_2" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "45 / 10" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "25 / 5" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "90 / 15" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Count-up/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onChange with 'count_up' when Count-up chip is clicked", () => {
    const onChange = vi.fn();
    render(<ModePicker presets={PRESETS} value="preset_1" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Count-up/i }));
    expect(onChange).toHaveBeenCalledWith("count_up");
  });

  it("calls onChange with 'preset_3' when the 90 / 15 chip is clicked", () => {
    const onChange = vi.fn();
    render(<ModePicker presets={PRESETS} value="preset_1" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "90 / 15" }));
    expect(onChange).toHaveBeenCalledWith("preset_3");
  });

  it("deselects 25 / 5 and selects 45 / 10 after clicking it (bug 9.1 regression)", () => {
    render(<ControlledModePicker initialValue="preset_1" />);
    expect(screen.getByRole("button", { name: "25 / 5" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "45 / 10" }));
    expect(screen.getByRole("button", { name: "25 / 5" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "45 / 10" })).toHaveAttribute("aria-pressed", "true");
  });
});
