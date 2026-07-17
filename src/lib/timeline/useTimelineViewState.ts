import { useState } from "react";
import { categoryId, type ColorAxis } from "@/lib/timeline/color";
import type { HoursRange, Scale } from "@/lib/timeline/dateRange";
import { useHoursRange } from "@/lib/timeline/useHoursRange";
import type { SessionListItem } from "@/lib/types";

function toggleInSet(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

export interface TimelineViewState {
  scale: Scale;
  anchorOverride: Date | null;
  hoursRange: HoursRange;
  colorBy: ColorAxis;
  focusOn: boolean;
  energyOn: boolean;
  dotsOn: boolean;
  topicFilter: Set<string>;
  formatFilter: Set<string>;
  selectedSession: SessionListItem | null;
  setAnchorOverride: (date: Date | null) => void;
  setHoursRange: (hoursRange: HoursRange) => void;
  setColorBy: (colorBy: ColorAxis) => void;
  setSelectedSession: (session: SessionListItem | null) => void;
  changeScale: (next: Scale) => void;
  toggleFocus: () => void;
  toggleEnergy: () => void;
  toggleDots: () => void;
  toggleTopic: (id: string) => void;
  toggleFormat: (id: string) => void;
}

/** Owns all timeline view state (scale, nav, colorBy, hoursRange, filters, rating toggles, dialog selection),
 * including the Month single-channel-shading mutual exclusion between Focus and Energy (see change.md). */
export function useTimelineViewState(sessions: SessionListItem[]): TimelineViewState {
  const [scale, setScale] = useState<Scale>("week");
  const [anchorOverride, setAnchorOverride] = useState<Date | null>(null);
  const [hoursRange, setHoursRange] = useHoursRange();
  const [colorBy, setColorBy] = useState<ColorAxis>("topic");
  const [focusOn, setFocusOn] = useState(false);
  const [energyOn, setEnergyOn] = useState(false);
  const [dotsOn, setDotsOn] = useState(true);
  const [topicFilter, setTopicFilter] = useState(() => new Set(sessions.map((s) => categoryId("topic", s))));
  const [formatFilter, setFormatFilter] = useState(() => new Set(sessions.map((s) => categoryId("format", s))));
  const [selectedSession, setSelectedSession] = useState<SessionListItem | null>(null);

  function changeScale(next: Scale) {
    setScale(next);
    if (next === "month" && focusOn && energyOn) {
      setEnergyOn(false);
    }
  }

  function toggleFocus() {
    const next = !focusOn;
    setFocusOn(next);
    if (scale === "month" && next) {
      setEnergyOn(false);
    }
  }

  function toggleEnergy() {
    const next = !energyOn;
    setEnergyOn(next);
    if (scale === "month" && next) {
      setFocusOn(false);
    }
  }

  return {
    scale,
    anchorOverride,
    hoursRange,
    colorBy,
    focusOn,
    energyOn,
    dotsOn,
    topicFilter,
    formatFilter,
    selectedSession,
    setAnchorOverride,
    setHoursRange,
    setColorBy,
    setSelectedSession,
    changeScale,
    toggleFocus,
    toggleEnergy,
    toggleDots: () => {
      setDotsOn((prev) => !prev);
    },
    toggleTopic: (id) => {
      setTopicFilter((prev) => toggleInSet(prev, id));
    },
    toggleFormat: (id) => {
      setFormatFilter((prev) => toggleInSet(prev, id));
    },
  };
}
