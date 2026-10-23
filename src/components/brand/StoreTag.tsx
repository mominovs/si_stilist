import type { CardStore } from "@/lib/search";

/** Do'kon belgisi: logotip o'rniga bosh harf do'kon rangida, yonida nomi va shahri */
export function StoreTag({ store, compact = false }: { store: CardStore; compact?: boolean }) {
  return (
    <span className={`flex min-w-0 items-center gap-1.5 font-semibold text-ink ${compact ? "text-[11px]" : "text-xs"}`}>
      <span
        aria-hidden
        className={`flex shrink-0 items-center justify-center rounded-full font-extrabold text-white ${compact ? "h-4 w-4 text-[9px]" : "h-5 w-5 text-[10px]"}`}
        style={{ background: store.color }}
      >
        {store.name.charAt(0).toUpperCase()}
      </span>
      <span className="truncate">
        {store.name}
        <span className="font-medium text-muted"> · {store.city}</span>
      </span>
    </span>
  );
}
