import { Button } from "@/components/ui/button";
import type { Scale } from "@/lib/timeline/dateRange";

interface ShowTogglesProps {
  scale: Scale;
  focusOn: boolean;
  energyOn: boolean;
  dotsOn: boolean;
  onToggleFocus: () => void;
  onToggleEnergy: () => void;
  onToggleDots: () => void;
}

export default function ShowToggles({
  scale,
  focusOn,
  energyOn,
  dotsOn,
  onToggleFocus,
  onToggleEnergy,
  onToggleDots,
}: ShowTogglesProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-ash text-xs">{scale === "month" ? "Shade by" : "Show"}</span>
      <Button type="button" variant={focusOn ? "default" : "outline"} size="sm" onClick={onToggleFocus}>
        Focus
      </Button>
      <Button type="button" variant={energyOn ? "default" : "outline"} size="sm" onClick={onToggleEnergy}>
        Energy
      </Button>
      {scale !== "month" && (
        <Button type="button" variant={dotsOn ? "default" : "outline"} size="sm" onClick={onToggleDots}>
          Dots
        </Button>
      )}
    </div>
  );
}
