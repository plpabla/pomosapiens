import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { LegendCategory } from "@/lib/timeline/color";
import { cn } from "@/lib/utils";

interface LegendGroupProps {
  title: string;
  categories: LegendCategory[];
  enabled: Set<string>;
  onToggle: (id: string) => void;
  getColor: (id: string) => string;
  onOpenColor: (id: string, name: string) => void;
}

function LegendGroup({ title, categories, enabled, onToggle, getColor, onOpenColor }: LegendGroupProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-ash text-xs font-semibold tracking-wide uppercase">{title}</span>
      {categories.map((category) => {
        const isOn = enabled.has(category.id);
        return (
          <div key={category.id} className={cn("flex items-center gap-1", !isOn && "opacity-40")}>
            <button
              type="button"
              aria-label={`Recolor ${category.name}`}
              onClick={() => {
                onOpenColor(category.id, category.name);
              }}
              className="ring-offset-background hover:ring-ash flex size-6 shrink-0 items-center justify-center rounded-full hover:ring-1 hover:ring-offset-1"
            >
              <span className="size-2.5 rounded-full" style={{ backgroundColor: getColor(category.id) }} />
            </button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={isOn}
              onClick={() => {
                onToggle(category.id);
              }}
            >
              {category.name}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

interface LegendProps {
  topics: LegendCategory[];
  formats: LegendCategory[];
  topicFilter: Set<string>;
  formatFilter: Set<string>;
  onToggleTopic: (id: string) => void;
  onToggleFormat: (id: string) => void;
  getColor: (id: string) => string;
  onOpenColor: (id: string, name: string) => void;
}

export default function Legend({
  topics,
  formats,
  topicFilter,
  formatFilter,
  onToggleTopic,
  onToggleFormat,
  getColor,
  onOpenColor,
}: LegendProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 px-4">
        <LegendGroup
          title="Topic"
          categories={topics}
          enabled={topicFilter}
          onToggle={onToggleTopic}
          getColor={getColor}
          onOpenColor={onOpenColor}
        />
        <LegendGroup
          title="Format"
          categories={formats}
          enabled={formatFilter}
          onToggle={onToggleFormat}
          getColor={getColor}
          onOpenColor={onOpenColor}
        />
      </CardContent>
    </Card>
  );
}
