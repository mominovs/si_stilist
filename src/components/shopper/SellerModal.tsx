"use client";

import type { ReserveResponse } from "@/app/api/reserve/route";

/** Xaridor ekranni sotuvchiga ko'rsatadi: katta kod, tovar va o'lcham. Sotuvchi panelda ham shu kodni ko'radi */
export function SellerModal({ data, onClose }: { data: ReserveResponse; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-md space-y-5 rounded-2xl bg-white p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="text-sm text-neutral-500">Shu ekranni sotuvchiga ko&apos;rsating</div>
          <div className="mt-2 font-mono text-6xl font-bold tracking-tight">#{data.code}</div>
        </div>
        <div className="space-y-1 rounded-xl bg-neutral-50 p-4">
          <div className="text-lg font-semibold">{data.name}</div>
          <div className="text-sm text-neutral-600">
            {data.sku && <span className="font-mono">{data.sku} · </span>}
            {data.color}
          </div>
          <div className="flex items-center justify-center gap-4 pt-2">
            <span className="rounded-lg bg-neutral-900 px-4 py-2 text-2xl font-semibold text-white">{data.size}</span>
            <span className="text-xl font-semibold">{data.priceLabel}</span>
          </div>
        </div>
        <p className="text-xs text-neutral-500">Sotuvchi do&apos;kon panelida ham shu kodni ko&apos;radi va tovarni olib keladi.</p>
        <button onClick={onClose} className="w-full rounded-xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white hover:bg-neutral-700">
          Yopish
        </button>
      </div>
    </div>
  );
}
