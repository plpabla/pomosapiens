import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { defaultColorFor, type LegendCategory } from "@/lib/timeline/color";
import { cn } from "@/lib/utils";

interface LegendGroupProps {
  title: string;
  categories: LegendCategory[];
  enabled: Set<string>;
  onToggle: (id: string) => void;
}

function LegendGroup({ title, categories, enabled, onToggle }: LegendGroupProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-ash text-xs font-semibold tracking-wide uppercase">{title}</span>
      {categories.map((category) => {
        const isOn = enabled.has(category.id);
        return (
          <Button
            key={category.id}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={isOn}
            onClick={() => {
              onToggle(category.id);
            }}
            className={cn("gap-1.5", !isOn && "opacity-40")}
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: defaultColorFor(category.id) }}
            />
            {category.name}
          </Button>
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
}

export default function Legend({
  topics,
  formats,
  topicFilter,
  formatFilter,
  onToggleTopic,
  onToggleFormat,
}: LegendProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 px-4">
        <LegendGroup title="Topic" categories={topics} enabled={topicFilter} onToggle={onToggleTopic} />
        <LegendGroup title="Format" categories={formats} enabled={formatFilter} onToggle={onToggleFormat} />
      </CardContent>
    </Card>
  );
}
