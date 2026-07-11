import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ServerError } from "@/components/auth/ServerError";
import { toMin, type RowState } from "@/lib/session/usePresetEditor";
import type { Preset } from "@/lib/types";

interface Props {
  preset: Preset;
  row: RowState;
  onFocusChange: (value: string) => void;
  onBreakChange: (value: string) => void;
  onSave: () => void;
}

export default function PresetRow({ preset, row, onFocusChange, onBreakChange, onSave }: Props) {
  const unchanged = row.focusMin === toMin(preset.focus_seconds) && row.breakMin === toMin(preset.break_seconds);

  return (
    <div className="border-charred bg-ember/20 space-y-3 rounded-lg border px-4 py-3">
      <h3 className="text-off-white font-semibold">Preset {preset.slot}</h3>
      <div className="flex items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor={`focus-${preset.slot}`}>Focus (min)</Label>
          <Input
            id={`focus-${preset.slot}`}
            type="number"
            min={1}
            max={240}
            value={row.focusMin}
            onChange={(e) => {
              onFocusChange(e.target.value);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`break-${preset.slot}`}>Break (min)</Label>
          <Input
            id={`break-${preset.slot}`}
            type="number"
            min={0}
            max={60}
            value={row.breakMin}
            onChange={(e) => {
              onBreakChange(e.target.value);
            }}
          />
        </div>
        <Button disabled={unchanged || row.submitting} onClick={onSave}>
          {row.submitting ? "Saving..." : "Save"}
        </Button>
      </div>
      <ServerError message={row.error} />
    </div>
  );
}
