import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Topic, MaterialFormat, EnergyLevel } from "@/lib/types";

export const NONE = "__none__";

export const triggerClass = "w-full border-charred bg-ember text-off-white hover:bg-ember focus:ring-0";

export const ENERGY_LEVELS: { value: EnergyLevel; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

interface TopicSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  topics: Topic[];
  id?: string;
  ariaLabel?: string;
}

export function TopicSelect({ value, onChange, topics, id, ariaLabel = "Topic" }: TopicSelectProps) {
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => {
        // Radix's hidden native <select> (used for HTML form bubbling) fires a
        // synthetic change with "" when the controlled value points to an item
        // whose dropdown has never been opened -- e.g. a topic just created and
        // auto-selected inline. Real "clear" selections use the NONE sentinel,
        // so "" is never a legitimate user choice.
        if (v === "") return;
        onChange(v === NONE ? null : v);
      }}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={triggerClass}>
        <SelectValue placeholder="No topic" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No topic</SelectItem>
        {topics.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface MaterialFormatSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  formats: MaterialFormat[];
  id?: string;
  ariaLabel?: string;
}

export function MaterialFormatSelect({
  value,
  onChange,
  formats,
  id,
  ariaLabel = "Material format",
}: MaterialFormatSelectProps) {
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => {
        // See TopicSelect's onValueChange for why "" must be ignored here.
        if (v === "") return;
        onChange(v === NONE ? null : v);
      }}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={triggerClass}>
        <SelectValue placeholder="No format" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No format</SelectItem>
        {formats.map((f) => (
          <SelectItem key={f.id} value={f.id}>
            {f.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
