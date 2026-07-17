import { describe, it, expect } from "vitest";
import { axisTicks, clampAnchor, isoWeek, rangeForScale, rangeLabel, shiftAnchor } from "@/lib/timeline/dateRange";

describe("isoWeek", () => {
  it("computes standard week numbers", () => {
    expect(isoWeek(new Date(2026, 6, 16)).week).toBe(29);
  });

  it("rolls a late-Dec Monday into next year's week 1", () => {
    expect(isoWeek(new Date(2019, 11, 30)).week).toBe(1);
    expect(isoWeek(new Date(2018, 11, 31)).week).toBe(1);
  });

  it("rolls an early-Jan Friday back into the prior year's week 53", () => {
    expect(isoWeek(new Date(2016, 0, 1)).week).toBe(53);
  });
});

describe("rangeForScale", () => {
  it("day: returns the single day as [start, start+1)", () => {
    const { start, end } = rangeForScale(new Date(2026, 6, 16), "day");
    expect(start).toEqual(new Date(2026, 6, 16));
    expect(end).toEqual(new Date(2026, 6, 17));
  });

  it("week: starts Monday regardless of anchor weekday", () => {
    // 2026-07-16 is a Thursday; the Monday-start week is Jul 13 - Jul 20 (exclusive end).
    const { start, end } = rangeForScale(new Date(2026, 6, 16), "week");
    expect(start).toEqual(new Date(2026, 6, 13));
    expect(end).toEqual(new Date(2026, 6, 20));
  });

  it("week: anchor already on Monday stays put", () => {
    const { start } = rangeForScale(new Date(2026, 6, 13), "week");
    expect(start).toEqual(new Date(2026, 6, 13));
  });

  it("month: spans the first through the first of next month", () => {
    const { start, end } = rangeForScale(new Date(2026, 6, 16), "month");
    expect(start).toEqual(new Date(2026, 6, 1));
    expect(end).toEqual(new Date(2026, 7, 1));
  });

  it("month: December rolls the end into January of next year", () => {
    const { end } = rangeForScale(new Date(2026, 11, 5), "month");
    expect(end).toEqual(new Date(2027, 0, 1));
  });
});

describe("shiftAnchor", () => {
  it("day: shifts by one calendar day", () => {
    expect(shiftAnchor(new Date(2026, 6, 16), "day", 1)).toEqual(new Date(2026, 6, 17));
    expect(shiftAnchor(new Date(2026, 6, 16), "day", -1)).toEqual(new Date(2026, 6, 15));
  });

  it("week: shifts by seven days, crossing month boundaries", () => {
    expect(shiftAnchor(new Date(2026, 6, 30), "week", 1)).toEqual(new Date(2026, 7, 6));
  });

  it("month: shifts by one month, crossing year boundaries", () => {
    expect(shiftAnchor(new Date(2026, 11, 15), "month", 1)).toEqual(new Date(2027, 0, 1));
    expect(shiftAnchor(new Date(2026, 0, 15), "month", -1)).toEqual(new Date(2025, 11, 1));
  });
});

describe("clampAnchor", () => {
  const earliest = new Date(2026, 5, 1); // Jun 1, 2026
  const today = new Date(2026, 6, 16); // Jul 16, 2026

  it("clamps below the earliest session's period", () => {
    const result = clampAnchor(new Date(2025, 0, 1), "month", earliest, today);
    expect(result).toEqual(rangeForScale(earliest, "month").start);
  });

  it("clamps above today's period", () => {
    const result = clampAnchor(new Date(2027, 0, 1), "month", earliest, today);
    expect(result).toEqual(rangeForScale(today, "month").start);
  });

  it("passes through an anchor within bounds, normalized to its period start", () => {
    const result = clampAnchor(new Date(2026, 5, 15), "week", earliest, today);
    expect(result).toEqual(rangeForScale(new Date(2026, 5, 15), "week").start);
  });

  it("allows the exact earliest and current periods at the boundary", () => {
    expect(clampAnchor(earliest, "day", earliest, today)).toEqual(rangeForScale(earliest, "day").start);
    expect(clampAnchor(today, "day", earliest, today)).toEqual(rangeForScale(today, "day").start);
  });
});

describe("rangeLabel", () => {
  it("day: full weekday + date", () => {
    // 2026-07-16 is a Thursday.
    expect(rangeLabel(new Date(2026, 6, 16), "day")).toBe("Thursday, Jul 16, 2026");
  });

  it("week: ISO week + Monday-Sunday span", () => {
    expect(rangeLabel(new Date(2026, 6, 16), "week")).toBe("CW29 · Jul 13 – Jul 19, 2026");
  });

  it("month: month + year", () => {
    expect(rangeLabel(new Date(2026, 6, 16), "month")).toBe("July 2026");
  });
});

describe("axisTicks", () => {
  it("uses 3h steps for spans wider than 12h, including both endpoints", () => {
    expect(axisTicks({ start: 6, end: 23 })).toEqual([6, 9, 12, 15, 18, 21, 23]);
  });

  it("uses 2h steps for spans of 12h or less, including both endpoints", () => {
    expect(axisTicks({ start: 8, end: 18 })).toEqual([8, 10, 12, 14, 16, 18]);
  });

  it("does not duplicate the end tick when the span divides evenly", () => {
    expect(axisTicks({ start: 6, end: 21 })).toEqual([6, 9, 12, 15, 18, 21]);
  });
});
