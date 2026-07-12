import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface MenuItemProps {
  glyph: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

function MenuItem({ glyph, label, onSelect, destructive = false }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={cn(
        "hover:bg-charred flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
        destructive ? "text-destructive" : "text-popover-foreground",
      )}
    >
      <span aria-hidden="true">{glyph}</span>
      {label}
    </button>
  );
}

interface Props {
  onEdit: () => void;
  onDelete: () => void;
}

export default function SessionActionsMenu({ onEdit, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function select(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="text-off-white/75 hover:bg-charred hover:text-off-white flex size-[22px] items-center justify-center rounded-md text-base leading-none transition-colors"
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {open && (
        <div
          role="menu"
          className="border-charred bg-popover absolute top-8 right-0 z-10 min-w-[7rem] overflow-hidden rounded-lg border shadow-lg"
        >
          <MenuItem
            glyph="✎"
            label="Edit"
            onSelect={() => {
              select(onEdit);
            }}
          />
          <MenuItem
            glyph="✕"
            label="Delete"
            destructive
            onSelect={() => {
              select(onDelete);
            }}
          />
        </div>
      )}
    </div>
  );
}
