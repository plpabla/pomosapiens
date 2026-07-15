import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import FocusRatingChart from "@/components/dashboard/FocusRatingChart";

afterEach(() => {
  cleanup();
});

describe("FocusRatingChart", () => {
  it("shows an empty-state message when there are no rated sessions", () => {
    render(<FocusRatingChart sessions={[]} />);

    expect(screen.getByText(/rate a few sessions to see your focus trend/i)).toBeInTheDocument();
  });

  it("shows an empty-state message when there is only one rated session", () => {
    render(
      <FocusRatingChart
        sessions={[
          {
            started_at: "2026-07-01T10:00:00Z",
            focus_rating: 4,
            duration_seconds: 1500,
            energy_level: "high",
            topic: { name: "Reading" },
            material_format: null,
          },
        ]}
      />,
    );

    expect(screen.getByText(/rate a few sessions to see your focus trend/i)).toBeInTheDocument();
  });

  it("renders the chart instead of the empty state when there are 2+ rated sessions", () => {
    render(
      <FocusRatingChart
        sessions={[
          {
            started_at: "2026-07-01T10:00:00Z",
            focus_rating: 4,
            duration_seconds: 1500,
            energy_level: "high",
            topic: { name: "Reading" },
            material_format: null,
          },
          {
            started_at: "2026-07-02T10:00:00Z",
            focus_rating: 5,
            duration_seconds: 2400,
            energy_level: "medium",
            topic: null,
            material_format: null,
          },
        ]}
      />,
    );

    expect(screen.queryByText(/rate a few sessions to see your focus trend/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("focus-rating-chart")).toBeInTheDocument();
  });
});
