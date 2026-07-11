import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ENERGY_LEVELS } from "@/components/session/CatalogSelects";
import type { EnergyLevel } from "@/lib/types";

interface Props {
  value: EnergyLevel | null;
  onChange: (value: EnergyLevel) => void;
}

export default function EnergyLevelPicker({ value, onChange }: Props) {
  return (
    <div className="mb-6 flex justify-center gap-4">
      {ENERGY_LEVELS.map(({ value: level, label }) => (
        <Button
          key={level}
          type="button"
          aria-pressed={value === level}
          onClick={() => {
            onChange(level);
          }}
          className={cn(
            "border px-6",
            value === level ? "bg-blaze text-off-white border-blaze" : "bg-ember text-off-white border-charred",
          )}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
