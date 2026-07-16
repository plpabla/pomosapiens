import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function TimelineEmptyState() {
  return (
    <Card className="border-charred bg-transparent p-6 text-center shadow-none">
      <CardContent className="flex flex-col items-center gap-4 px-0">
        <p className="text-off-white text-lg font-semibold">No sessions yet</p>
        <p className="text-ash text-sm">Start a focus session to see it show up here as a block on your timeline.</p>
        <Button asChild>
          <a href="/session/new">Start session</a>
        </Button>
      </CardContent>
    </Card>
  );
}
