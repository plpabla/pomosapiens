import { Card, CardHeader } from "@/components/ui/card";
import ColorBySwitch from "@/components/timeline/ColorBySwitch";
import DateNav from "@/components/timeline/DateNav";
import HoursRangeSelect from "@/components/timeline/HoursRangeSelect";
import ScaleSelect from "@/components/timeline/ScaleSelect";
import ShowToggles from "@/components/timeline/ShowToggles";
import type { ColorAxis } from "@/lib/timeline/color";
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
  colorBy: ColorAxis;
  onColorByChange: (colorBy: ColorAxis) => void;
  focusOn: boolean;
  energyOn: boolean;
  dotsOn: boolean;
  onToggleFocus: () => void;
  onToggleEnergy: () => void;
  onToggleDots: () => void;
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
  colorBy,
  onColorByChange,
  focusOn,
  energyOn,
  dotsOn,
  onToggleFocus,
  onToggleEnergy,
  onToggleDots,
}: ToolbarProps) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3">
        <div className="flex flex-row flex-wrap items-center gap-4">
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
        </div>

        <div className="border-charred flex flex-row flex-wrap items-center gap-4 border-t pt-3">
          <div className="border-charred rounded-md border px-2 py-1">
            <ColorBySwitch colorBy={colorBy} onColorByChange={onColorByChange} />
          </div>
          <div className="bg-charred hidden h-6 w-px sm:block" />
          <ShowToggles
            scale={scale}
            focusOn={focusOn}
            energyOn={energyOn}
            dotsOn={dotsOn}
            onToggleFocus={onToggleFocus}
            onToggleEnergy={onToggleEnergy}
            onToggleDots={onToggleDots}
          />
        </div>
      </CardHeader>
    </Card>
  );
}
