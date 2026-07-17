import { useState } from "react";
import { hexToHsva, hsvaToHex, ShadeSlider, Wheel, type HsvaColor } from "@uiw/react-color";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ColorWheelDialogProps {
  open: boolean;
  initialColor: string;
  onOpenChange: (open: boolean) => void;
  onDone: (hex: string) => void;
}

export default function ColorWheelDialog({ open, initialColor, onOpenChange, onDone }: ColorWheelDialogProps) {
  const [hsva, setHsva] = useState<HsvaColor>(() => hexToHsva(initialColor));

  // Re-seed the wheel from the category's current color on every closed->open transition
  // (React's documented "adjusting state during rendering" pattern -- no effect needed).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setHsva(hexToHsva(initialColor));
  }

  const hex = hsvaToHex(hsva);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Color wheel</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <Wheel
            color={hsva}
            width={200}
            height={200}
            onChange={(next) => {
              setHsva((prev) => ({ ...prev, ...next.hsva }));
            }}
          />
          <ShadeSlider
            hsva={hsva}
            style={{ width: 200 }}
            onChange={(shade) => {
              setHsva((prev) => ({ ...prev, ...shade }));
            }}
          />
          <div className="border-charred h-8 w-full rounded-md border" style={{ backgroundColor: hex }} />
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              onDone(hex);
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
