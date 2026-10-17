"use client";

import Link from "next/link";
import { useState } from "react";
import { supportsMirror } from "@/lib/catalog";
import type { ResultCard as Card } from "@/lib/search";
import { HangerIcon } from "@/components/brand/Logo";

const TIER_LABEL = { arzon: "arzon", orta: "o'rta narx", qimmat: "premium" } as const;

export function ResultCard({
  card,
  requestedSize,
  onTryOn,
  onReserve,
}: {
  card: Card;
  requestedSize: string | null;
  onTryOn: () => void;
  /** "Sotuvchiga ko'rsatish": tanlangan o'lcham bilan */
  onReserve: (size: string) => void;
}) {
  const inStock = card.sizes.filter((s) => s.inStock).map((s) => s.size);
  // So'ralgan o'lcham bor bo'lsa, oldindan tanlanadi; bitta o'lcham qolgan bo'lsa ham
  const [size, setSize] = useState<string | null>(
    requestedSize && inStock.includes(requestedSize) ? requestedSize : inStock.length === 1 ? inStock[0] : null,
  );

  return (
    <article className="card card-lift flex flex-col overflow-hidden">
      <div className="relative aspect-[4/5] bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={card.imageUrl} alt={card.name} className="h-full w-full object-contain p-5 mix-blend-multiply" />
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          <span className={`badge ${card.isExact ? "badge-ok" : "badge-warn"}`}>
            <span className={`h-2 w-2 rounded-full ${card.isExact ? "bg-success-dot" : "bg-warning-dot"}`} />
            {card.isExact ? "Omborda bor" : "O'xshashi bor"}
          </span>
          {card.reason && <span className="badge bg-surface text-warning shadow-[var(--shadow-soft)]">{card.reason}</span>}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 className="font-display text-lg font-bold leading-snug text-brand">{card.name}</h3>
          <div className="mt-1 whitespace-nowrap font-display text-xl font-extrabold text-ink">{card.priceLabel}</div>
          <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
            <span className="h-3 w-3 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,.12)]" style={{ background: card.colorHex }} />
            {card.color} · {TIER_LABEL[card.tier]}
          </div>
        </div>

        <div>
          <div className="field-label mb-2">O&apos;lchamni tanlang</div>
          <div className="flex flex-wrap gap-2">
            {card.sizes.map((s) => (
              <button
                key={s.size}
                type="button"
                disabled={!s.inStock}
                onClick={() => setSize(s.size === size ? null : s.size)}
                aria-pressed={size === s.size}
                className={`chip chip-size ${!s.inStock ? "chip-off" : size === s.size ? "chip-on" : ""}`}
              >
                {s.size}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto space-y-2 pt-1">
          <button onClick={onTryOn} className="btn btn-primary btn-lg w-full">
            <HangerIcon />
            O&apos;zimda ko&apos;rish
          </button>
          <div className={`grid gap-2 ${supportsMirror(card.category) ? "grid-cols-2" : "grid-cols-1"}`}>
            {supportsMirror(card.category) && (
              <Link href={`/oyna?productId=${card.id}`} prefetch={false} className="btn btn-ghost btn-sm">
                Jonli oyna
              </Link>
            )}
            <button
              onClick={() => size && onReserve(size)}
              disabled={!size}
              title={size ? undefined : "Avval o'lchamni tanlang"}
              className="btn btn-ghost btn-sm"
            >
              {size ? `Sotuvchiga · ${size}` : "Sotuvchiga ko'rsatish"}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
