"use client";

import type { ReserveResponse } from "@/app/api/reserve/route";

/** Xaridor ekranni sotuvchiga ko'rsatadi: katta kod, tovar va o'lcham. Sotuvchi panelda ham shu kodni ko'radi */
export function SellerModal({ data, onClose }: { data: ReserveResponse; onClose: () => void }) {
  return (
    <div className="scrim fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal w-full max-w-md space-y-5 p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="eyebrow">Shu ekranni sotuvchiga ko&apos;rsating</div>
          <div className="mt-2 font-display text-7xl font-extrabold tracking-tight text-brand">#{data.code}</div>
        </div>
        <div className="space-y-1 rounded-2xl bg-surface-2 p-4">
          <div className="font-display text-lg font-bold text-brand">{data.name}</div>
          <div className="text-sm font-semibold text-muted">
            {data.sku && <span className="font-mono">{data.sku} · </span>}
            {data.color}
          </div>
          <div className="flex items-center justify-center gap-4 pt-2">
            <span className="rounded-xl bg-brand px-4 py-2 font-display text-2xl font-extrabold text-white">{data.size}</span>
            <span className="font-display text-xl font-extrabold">{data.priceLabel}</span>
          </div>
        </div>
        {data.ordered ? (
          <p className="rounded-2xl bg-warning-soft p-3 text-sm font-medium text-warning">
            Bu o&apos;lcham hozir omborda yo&apos;q: sotuvchi buyurtma qiladi va kelganda sizga xabar beradi.
          </p>
        ) : (
          <p className="text-xs font-medium text-muted">Sotuvchi do&apos;kon panelida ham shu kodni ko&apos;radi va tovarni olib keladi.</p>
        )}
        <button onClick={onClose} className="btn btn-brand btn-lg w-full">
          Yopish
        </button>
      </div>
    </div>
  );
}
