import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import SessionStartForm from "@/components/session/SessionStartForm";
import { DEFAULT_PRESETS } from "@/lib/timer/preset-defaults";

afterEach(() => {
  cleanup();
});

const BASE_PROPS = {
  presets: [...DEFAULT_PRESETS],
  topics: [],
  formats: [],
  mode: "preset_1" as const,
  onModeChange: vi.fn(),
  energy: null,
  onEnergyChange: vi.fn(),
  topicId: null,
  onTopicChange: vi.fn(),
  materialFormatId: null,
  onFormatChange: vi.fn(),
  loadError: null,
  submitError: null,
  submitting: false,
  onSubmit: vi.fn(),
};

describe("SessionStartForm", () => {
  it("renders topicSlot content when provided", () => {
    render(<SessionStartForm {...BASE_PROPS} topicSlot={<button>New topic</button>} />);
    expect(screen.getByRole("button", { name: "New topic" })).toBeInTheDocument();
  });

  it("omits topicSlot content when not provided", () => {
    render(<SessionStartForm {...BASE_PROPS} />);
    expect(screen.queryByRole("button", { name: "New topic" })).not.toBeInTheDocument();
  });

  it("disables the submit button until energy is chosen", () => {
    render(<SessionStartForm {...BASE_PROPS} />);
    expect(screen.getByRole("button", { name: /start/i })).toBeDisabled();
  });

  it("shows 'Starting...' and keeps the button disabled while submitting", () => {
    render(<SessionStartForm {...BASE_PROPS} energy="medium" submitting />);
    expect(screen.getByRole("button", { name: /starting/i })).toBeDisabled();
  });

  it("shows the load error and submit error messages when present", () => {
    render(
      <SessionStartForm
        {...BASE_PROPS}
        loadError="Could not load topics and formats."
        submitError="Failed to start session"
      />,
    );
    expect(screen.getByText("Could not load topics and formats.")).toBeInTheDocument();
    expect(screen.getByText("Failed to start session")).toBeInTheDocument();
  });
});
