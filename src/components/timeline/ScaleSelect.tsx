import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Scale } from "@/lib/timeline/dateRange";

const SCALE_OPTIONS: { value: Scale; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

interface ScaleSelectProps {
  scale: Scale;
  onScaleChange: (scale: Scale) => void;
}

export default function ScaleSelect({ scale, onScaleChange }: ScaleSelectProps) {
  return (
    <Select
      value={scale}
      onValueChange={(next) => {
        onScaleChange(next as Scale);
      }}
    >
      <SelectTrigger className="w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SCALE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
