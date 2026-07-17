import { cn } from "@/lib/utils";
import SessionBlock from "@/components/timeline/SessionBlock";
import { axisPercent, LABEL_COLUMN_WIDTH_PX, ROW_HEIGHT_PX } from "@/lib/timeline/layout";
import type { ColorAxis } from "@/lib/timeline/color";
import type { HoursRange, Scale } from "@/lib/timeline/dateRange";
import type { SessionListItem } from "@/lib/types";

const weekdayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const narrowWeekdayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "narrow" });
const dayNumberFormatter = new Intl.DateTimeFormat("en-US", { day: "numeric" });

interface DayRowProps {
  date: Date;
  sessions: SessionListItem[];
  scale: Scale;
  hoursRange: HoursRange;
  ticks: number[];
  isToday: boolean;
  colorBy: ColorAxis;
  focusOn: boolean;
  energyOn: boolean;
  dotsOn: boolean;
  getColor: (id: string) => string;
  onSelectSession: (session: SessionListItem) => void;
}

export default function DayRow({
  date,
  sessions,
  scale,
  hoursRange,
  ticks,
  isToday,
  colorBy,
  focusOn,
  energyOn,
  dotsOn,
  getColor,
  onSelectSession,
}: DayRowProps) {
  return (
    <div
      className="border-charred flex border-b last:border-b-0"
      style={{ height: `${String(ROW_HEIGHT_PX[scale])}px` }}
    >
      <div
        style={{ width: `${String(LABEL_COLUMN_WIDTH_PX)}px` }}
        className={cn(
          "flex shrink-0 flex-col items-start justify-center px-2 text-xs leading-tight",
          isToday ? "text-spark font-semibold" : "text-ash",
        )}
      >
        {scale === "month" ? (
          <span>
            {narrowWeekdayFormatter.format(date)} {dayNumberFormatter.format(date)}
          </span>
        ) : (
          <>
            <span>{weekdayFormatter.format(date)}</span>
            <span>{dateFormatter.format(date)}</span>
          </>
        )}
      </div>

      <div className="relative flex-1">
        {ticks.map((hour) => (
          <div
            key={hour}
            className="bg-charred/60 absolute top-0 bottom-0 w-px"
            style={{ left: `${String(axisPercent(hour * 60, hoursRange))}%` }}
          />
        ))}
        {sessions.map((session) => (
          <SessionBlock
            key={session.id}
            session={session}
            scale={scale}
            hoursRange={hoursRange}
            colorBy={colorBy}
            focusOn={focusOn}
            energyOn={energyOn}
            dotsOn={dotsOn}
            getColor={getColor}
            onSelect={onSelectSession}
          />
        ))}
      </div>
    </div>
  );
}
