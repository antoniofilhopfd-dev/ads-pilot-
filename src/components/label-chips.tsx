export function LabelChips({ items }: { items: { id: string; name: string }[] }) {
  return <>{items.map((l) => <span key={l.id} className="mr-1 inline-block rounded-full bg-[#ece8fb] px-2 py-0.5 text-xs text-violet">{l.name}</span>)}</>;
}
