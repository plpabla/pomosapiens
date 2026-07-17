import { Button } from "@/components/ui/button";

interface DateNavProps {
  label: string;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export default function DateNav({ label, canGoPrev, canGoNext, onPrev, onNext, onToday }: DateNavProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" disabled={!canGoPrev} onClick={onPrev} aria-label="Previous">
          ‹
        </Button>
        <Button variant="outline" size="sm" onClick={onToday}>
          Today
        </Button>
        <Button variant="outline" size="icon" disabled={!canGoNext} onClick={onNext} aria-label="Next">
          ›
        </Button>
      </div>

      <span className="text-off-white text-sm font-medium">{label}</span>
    </div>
  );
}
