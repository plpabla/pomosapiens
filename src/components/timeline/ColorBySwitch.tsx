import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { ColorAxis } from "@/lib/timeline/color";

interface ColorBySwitchProps {
  colorBy: ColorAxis;
  onColorByChange: (colorBy: ColorAxis) => void;
}

export default function ColorBySwitch({ colorBy, onColorByChange }: ColorBySwitchProps) {
  const isFormat = colorBy === "format";

  return (
    <div className="flex items-center gap-2">
      <span className="text-ash text-xs">Color by</span>
      <span className={cn("text-xs", !isFormat ? "text-off-white font-semibold" : "text-ash")}>Topic</span>
      <Switch
        checked={isFormat}
        onCheckedChange={(checked) => {
          onColorByChange(checked ? "format" : "topic");
        }}
        aria-label="Color by Topic or Format"
      />
      <span className={cn("text-xs", isFormat ? "text-off-white font-semibold" : "text-ash")}>Format</span>
    </div>
  );
}
