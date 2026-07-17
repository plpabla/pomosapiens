import { Card, CardHeader } from "@/components/ui/card";
import DateNav from "@/components/timeline/DateNav";
import HoursRangeSelect from "@/components/timeline/HoursRangeSelect";
import ScaleSelect from "@/components/timeline/ScaleSelect";
import type { HoursRange, Scale } from "@/lib/timeline/dateRange";

interface ToolbarProps {
  scale: Scale;
  onScaleChange: (scale: Scale) => void;
  label: string;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  hoursRange: HoursRange;
  onHoursRangeChange: (hoursRange: HoursRange) => void;
}

export default function Toolbar({
  scale,
  onScaleChange,
  label,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  onToday,
  hoursRange,
  onHoursRangeChange,
}: ToolbarProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-4">
        <ScaleSelect scale={scale} onScaleChange={onScaleChange} />
        <DateNav
          label={label}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          onPrev={onPrev}
          onNext={onNext}
          onToday={onToday}
        />
        <HoursRangeSelect hoursRange={hoursRange} onHoursRangeChange={onHoursRangeChange} />
      </CardHeader>
    </Card>
  );
}
