import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Scale } from "@/lib/timeline/dateRange";

const SCALE_OPTIONS: { value: Scale; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

interface ToolbarProps {
  scale: Scale;
  onScaleChange: (scale: Scale) => void;
  label: string;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
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
}: ToolbarProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-4">
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

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" disabled={!canGoPrev} onClick={onPrev} aria-label="Previous">
            ‹
          </Button>
          <Button variant="outline" size="sm" onClick={onToday}>
            Today
          </Button>
          <Button variant="outline" size="icon" disabled={!canGoNext} onClick={onNext} aria-label="Next">
            ›
          </Button>
        </div>

        <span className="text-off-white text-sm font-medium">{label}</span>
      </CardHeader>
    </Card>
  );
}
