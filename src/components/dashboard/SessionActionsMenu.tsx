import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  onEdit: () => void;
  onDelete: () => void;
}

export default function SessionActionsMenu({ onEdit, onDelete }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="More actions"
        className="text-off-white/75 hover:bg-charred hover:text-off-white flex size-[22px] items-center justify-center rounded-md text-base leading-none transition-colors"
      >
        <span aria-hidden="true">⋮</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="border-charred bg-popover min-w-[7rem] rounded-lg">
        <DropdownMenuItem onSelect={onEdit} className="gap-2 text-sm">
          <span aria-hidden="true">✎</span>
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete} className="gap-2 text-sm">
          <span aria-hidden="true">✕</span>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
