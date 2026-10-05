import type { ResultCard as Card } from "@/lib/search";

const TIER_LABEL = { arzon: "arzon", orta: "o'rta narx", qimmat: "premium" } as const;

export function ResultCard({ card, requestedSize, onTryOn }: { card: Card; requestedSize: string | null; onTryOn: () => void }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="relative aspect-[4/5] bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={card.imageUrl} alt={card.name} className="h-full w-full object-contain p-4" />
        <span
          className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${
            card.isExact ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
          }`}
        >
          {card.isExact ? "Omborda bor" : "O'xshashi bor"}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 border-t border-neutral-100 p-4">
        <div>
          <h3 className="font-semibold leading-snug">{card.name}</h3>
          {card.reason && <p className="mt-0.5 text-sm text-amber-700">{card.reason}</p>}
        </div>

        <div className="space-y-1">
          <div className="whitespace-nowrap text-lg font-semibold">{card.priceLabel}</div>
          <div className="flex items-center gap-1.5 text-xs text-neutral-500">
            <span className="h-3 w-3 shrink-0 rounded-full border border-neutral-300" style={{ background: card.colorHex }} />
            {card.color} · {TIER_LABEL[card.tier]}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs text-neutral-500">Mavjud o&apos;lchamlar</div>
          <div className="flex flex-wrap gap-1.5">
            {card.sizes.map((s) => (
              <span
                key={s.size}
                className={`min-w-9 rounded-md border px-2 py-1 text-center text-sm ${
                  s.inStock ? "border-neutral-300 text-neutral-800" : "border-neutral-100 text-neutral-300 line-through"
                } ${requestedSize === s.size && s.inStock ? "border-neutral-900 bg-neutral-900 text-white" : ""}`}
              >
                {s.size}
              </span>
            ))}
          </div>
        </div>

        <button
          onClick={onTryOn}
          className="mt-auto rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          O&apos;zimda ko&apos;rish
        </button>
      </div>
    </article>
  );
}
