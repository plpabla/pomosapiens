interface Props {
  name: string;
  archived?: boolean;
  children: React.ReactNode;
}

export function CatalogRow({ name, archived = false, children }: Props) {
  return (
    <li
      className={
        archived
          ? "border-charred bg-ember/10 flex items-center justify-between rounded-lg border px-4 py-3 opacity-60"
          : "border-charred bg-ember/20 flex items-center justify-between rounded-lg border px-4 py-3"
      }
    >
      <span className={archived ? "text-ash line-through" : "text-off-white"}>{name}</span>
      {children}
    </li>
  );
}
