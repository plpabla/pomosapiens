import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { minutesFromSeconds } from "@/lib/time";
import type { Mode, Preset } from "@/lib/types";

interface Props {
  presets: Preset[];
  value: Mode;
  onChange: (mode: Mode) => void;
}

export default function ModePicker({ presets, value, onChange }: Props) {
  const chips: { mode: Mode; label: string }[] = [
    ...presets.map((p) => ({
      mode: `preset_${p.slot}`,
      label: `P${p.slot} ${minutesFromSeconds(p.focus_seconds)}/${minutesFromSeconds(p.break_seconds)}`,
    })),
    { mode: "count_up", label: "Count-up" },
  ];

  return (
    <div className="mb-4 flex justify-center gap-2">
      {chips.map(({ mode, label }) => (
        <Button
          key={mode}
          type="button"
          aria-pressed={value === mode}
          onClick={() => {
            onChange(mode);
          }}
          className={cn(
            "border px-4 text-sm",
            value === mode ? "bg-blaze text-off-white border-blaze" : "bg-ember text-off-white border-charred",
          )}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
