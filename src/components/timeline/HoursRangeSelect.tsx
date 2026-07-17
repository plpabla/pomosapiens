import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatHour, type HoursRange } from "@/lib/timeline/dateRange";

interface HoursRangeSelectProps {
  hoursRange: HoursRange;
  onHoursRangeChange: (hoursRange: HoursRange) => void;
}

export default function HoursRangeSelect({ hoursRange, onHoursRangeChange }: HoursRangeSelectProps) {
  const startOptions = Array.from({ length: hoursRange.end }, (_, hour) => hour);
  const endOptions = Array.from({ length: 24 - (hoursRange.start + 1) }, (_, index) => hoursRange.start + 1 + index);

  return (
    <div className="flex items-center gap-2">
      <span className="text-ash text-xs">Hours</span>
      <Select
        value={String(hoursRange.start)}
        onValueChange={(next) => {
          onHoursRangeChange({ start: Number(next), end: hoursRange.end });
        }}
      >
        <SelectTrigger className="w-24" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {startOptions.map((hour) => (
            <SelectItem key={hour} value={String(hour)}>
              {formatHour(hour)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-ash text-xs">–</span>
      <Select
        value={String(hoursRange.end)}
        onValueChange={(next) => {
          onHoursRangeChange({ start: hoursRange.start, end: Number(next) });
        }}
      >
        <SelectTrigger className="w-24" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {endOptions.map((hour) => (
            <SelectItem key={hour} value={String(hour)}>
              {formatHour(hour)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
