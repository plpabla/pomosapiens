import { useState } from "react";
import { Pencil } from "lucide-react";
import ColorWheelDialog from "@/components/timeline/ColorWheelDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PRESET_COLORS } from "@/lib/timeline/color";
import { cn } from "@/lib/utils";

export interface ColorPaletteTarget {
  categoryId: string;
  categoryName: string;
}

interface ColorPaletteDialogProps {
  target: ColorPaletteTarget | null;
  currentColor: string;
  onClose: () => void;
  onApply: (categoryId: string, hex: string) => void;
}

export default function ColorPaletteDialog({ target, currentColor, onClose, onApply }: ColorPaletteDialogProps) {
  const [wheelOpen, setWheelOpen] = useState(false);

  return (
    <>
      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Color · {target?.categoryName}</DialogTitle>
          </DialogHeader>
          <p className="text-ash text-sm">Choose a preset or open the color wheel</p>

          <div className="grid grid-cols-6 gap-2">
            {PRESET_COLORS.map((preset) => {
              const isActive = currentColor.toLowerCase() === preset.hex.toLowerCase();
              return (
                <button
                  key={preset.name}
                  type="button"
                  title={preset.name}
                  aria-label={preset.name}
                  aria-pressed={isActive}
                  onClick={() => {
                    if (target) onApply(target.categoryId, preset.hex);
                  }}
                  className={cn("size-8 rounded-full outline-offset-2", isActive && "outline-off-white outline-2")}
                  style={{ backgroundColor: preset.hex }}
                />
              );
            })}
            <button
              type="button"
              title="Custom color"
              aria-label="Open color wheel for a custom color"
              onClick={() => {
                setWheelOpen(true);
              }}
              className="relative flex size-8 items-center justify-center rounded-full"
              style={{
                background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
              }}
            >
              <Pencil className="size-3.5 text-white drop-shadow" />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ColorWheelDialog
        open={wheelOpen}
        initialColor={currentColor}
        onOpenChange={setWheelOpen}
        onDone={(hex) => {
          if (target) onApply(target.categoryId, hex);
          setWheelOpen(false);
          onClose();
        }}
      />
    </>
  );
}
