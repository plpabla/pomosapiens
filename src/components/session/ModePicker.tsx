import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Mode = "preset_1" | "preset_2" | "preset_3" | "count_up";

interface Preset {
  slot: 1 | 2 | 3;
  focus_seconds: number;
  break_seconds: number;
}

interface Props {
  presets: Preset[];
  value: Mode;
  onChange: (mode: Mode) => void;
}

export default function ModePicker({ presets, value, onChange }: Props) {
  const chips: { mode: Mode; label: string }[] = [
    ...presets.map((p) => ({
      mode: `preset_${p.slot}`,
      label: `P${p.slot} ${Math.round(p.focus_seconds / 60)}/${Math.round(p.break_seconds / 60)}`,
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
