import type { CSSProperties } from "react";
import { axisTicks, formatHour, type HoursRange } from "@/lib/timeline/dateRange";
import { axisPercent, LABEL_COLUMN_WIDTH_PX } from "@/lib/timeline/layout";

interface TimeAxisHeaderProps {
  hoursRange: HoursRange;
}

// The first/last tick labels are anchored to their edge (not center-translated) so they
// never poke past the track's bounds -- that overflow was forcing an unwanted horizontal
// scrollbar even though the grid otherwise fit the viewport.
function tickStyle(percent: number, isFirst: boolean, isLast: boolean): CSSProperties {
  if (isFirst) return { left: 0, transform: "translateY(-50%)" };
  if (isLast) return { right: 0, transform: "translateY(-50%)" };
  return { left: `${String(percent)}%`, transform: "translate(-50%, -50%)" };
}

export default function TimeAxisHeader({ hoursRange }: TimeAxisHeaderProps) {
  const ticks = axisTicks(hoursRange);

  return (
    <div className="border-charred flex border-b">
      <div style={{ width: `${String(LABEL_COLUMN_WIDTH_PX)}px` }} className="shrink-0" />
      <div className="relative h-8 flex-1">
        {ticks.map((hour, index) => (
          <span
            key={hour}
            className="text-ash absolute top-1/2 text-xs whitespace-nowrap"
            style={tickStyle(axisPercent(hour * 60, hoursRange), index === 0, index === ticks.length - 1)}
          >
            {formatHour(hour)}
          </span>
        ))}
      </div>
    </div>
  );
}
