import { Card, CardContent } from "@/components/ui/card";
import DayRow from "@/components/timeline/DayRow";
import TimeAxisHeader from "@/components/timeline/TimeAxisHeader";
import type { ColorAxis } from "@/lib/timeline/color";
import type { HoursRange, Scale } from "@/lib/timeline/dateRange";
import type { SessionListItem } from "@/lib/types";

interface TimelineGridProps {
  days: Date[];
  sessionsByDay: Map<number, SessionListItem[]>;
  scale: Scale;
  hoursRange: HoursRange;
  ticks: number[];
  today: Date;
  colorBy: ColorAxis;
  focusOn: boolean;
  energyOn: boolean;
  dotsOn: boolean;
  getColor: (id: string) => string;
  onSelectSession: (session: SessionListItem) => void;
}

export default function TimelineGrid({
  days,
  sessionsByDay,
  scale,
  hoursRange,
  ticks,
  today,
  colorBy,
  focusOn,
  energyOn,
  dotsOn,
  getColor,
  onSelectSession,
}: TimelineGridProps) {
  return (
    <Card>
      <CardContent className="px-4">
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <TimeAxisHeader hoursRange={hoursRange} />
            {days.map((day) => (
              <DayRow
                key={day.getTime()}
                date={day}
                sessions={sessionsByDay.get(day.getTime()) ?? []}
                scale={scale}
                hoursRange={hoursRange}
                ticks={ticks}
                isToday={day.getTime() === today.getTime()}
                colorBy={colorBy}
                focusOn={focusOn}
                energyOn={energyOn}
                dotsOn={dotsOn}
                getColor={getColor}
                onSelectSession={onSelectSession}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
