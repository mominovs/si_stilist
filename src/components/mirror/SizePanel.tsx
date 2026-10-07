"use client";

import {
  FIT_LABELS,
  HEIGHT_RANGE,
  WEIGHT_RANGE,
  type BodyEstimate,
  type BodyGender,
  type FitLevel,
  type SizeFit,
} from "@/lib/sizing";

export const FIT_STYLE: Record<FitLevel, { color: string; cls: string }> = {
  "juda-tor": { color: "#ef4444", cls: "bg-red-50 text-red-700 ring-red-200" },
  tor: { color: "#f59e0b", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  mos: { color: "#22c55e", cls: "bg-green-50 text-green-800 ring-green-200" },
  keng: { color: "#f59e0b", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  "juda-keng": { color: "#ef4444", cls: "bg-red-50 text-red-700 ring-red-200" },
};

const CONFIDENCE_LABEL = { past: "past", orta: "o'rta", yuqori: "yuqori" } as const;

export type BodyForm = { height: string; weight: string; gender: BodyGender };

const outOf = (v: string, [lo, hi]: readonly [number, number]) => {
  if (!v.trim()) return false;
  const n = Number(v.replace(",", "."));
  return !Number.isFinite(n) || n < lo || n > hi;
};

/**
 * Jonli oyna yonidagi o'lcham bloki: ixtiyoriy bo'y/vazn, har bir o'lcham bahosi (omborda yo'qlari ham),
 * tavsiya va "Sotuvchiga ko'rsatish" / "Buyurtma berish". Hisob brauzerda (src/lib/sizing.ts), hech narsa saqlanmaydi.
 */
export function SizePanel({
  form,
  onForm,
  estimate,
  camera,
  sizes,
  fits,
  recommended,
  chosen,
  onChoose,
  onOrder,
  ordering,
  orderError,
}: {
  form: BodyForm;
  onForm: (f: BodyForm) => void;
  estimate: BodyEstimate | null;
  /** Kamera o'lchovi: off (seans yo'q), measuring (to'planmoqda), blocked (beli ko'rinmaydi), done */
  camera: "off" | "measuring" | "blocked" | "done";
  sizes: { size: string; inStock: boolean }[];
  fits: Map<string, SizeFit>;
  recommended: string | null;
  chosen: string | null;
  onChoose: (size: string) => void;
  onOrder: () => void;
  ordering: boolean;
  orderError: string | null;
}) {
  const chosenFit = chosen ? fits.get(chosen) : undefined;
  const chosenInStock = sizes.find((s) => s.size === chosen)?.inStock ?? false;
  const missing = estimate ? [!estimate.sources.height && "bo'y", !estimate.sources.weight && "vazn"].filter(Boolean) : [];
  const recommendedInStock = sizes.find((s) => s.size === recommended)?.inStock;
  const cameraNote =
    camera === "measuring"
      ? "kamera o'lchamoqda…"
      : camera === "blocked"
        ? "kamera o'lchay olmayapti: uzoqroq turing, belingiz ham ko'rinsin"
        : null;

  return (
    <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">O&apos;lcham</h2>
        {estimate && (
          <span className="text-xs text-neutral-500">aniqlik: {CONFIDENCE_LABEL[estimate.confidence]}</span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <label className="text-xs text-neutral-500">
          Bo&apos;y, sm
          <input
            inputMode="numeric"
            value={form.height}
            onChange={(e) => onForm({ ...form, height: e.target.value.replace(/[^\d.,]/g, "").slice(0, 5) })}
            placeholder="175"
            className={`mt-0.5 w-full rounded-lg border px-2 py-1.5 text-sm text-neutral-900 ${outOf(form.height, HEIGHT_RANGE) ? "border-red-400" : "border-neutral-300"}`}
          />
        </label>
        <label className="text-xs text-neutral-500">
          Vazn, kg
          <input
            inputMode="numeric"
            value={form.weight}
            onChange={(e) => onForm({ ...form, weight: e.target.value.replace(/[^\d.,]/g, "").slice(0, 5) })}
            placeholder="70"
            className={`mt-0.5 w-full rounded-lg border px-2 py-1.5 text-sm text-neutral-900 ${outOf(form.weight, WEIGHT_RANGE) ? "border-red-400" : "border-neutral-300"}`}
          />
        </label>
        <div className="text-xs text-neutral-500">
          Siz
          <div className="mt-0.5 flex rounded-lg border border-neutral-300 p-0.5">
            {(["erkak", "ayol"] as const).map((g) => (
              <button
                key={g}
                onClick={() => onForm({ ...form, gender: g })}
                className={`rounded-md px-2 py-1 text-xs ${form.gender === g ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
              >
                {g === "erkak" ? "Erkak" : "Ayol"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-neutral-500">
        Ixtiyoriy. Bo&apos;y va vazningizni kiritsangiz, o&apos;lcham aniqroq ko&apos;rsatiladi. Ma&apos;lumotlar saqlanmaydi.
      </p>

      <div className="rounded-xl bg-neutral-50 p-3 text-sm">
        {!estimate ? (
          <span className="text-neutral-600">
            {camera === "measuring"
              ? "Kamera o'lchamoqda: to'g'ri turing, yelkalaringiz va belingiz ko'rinsin…"
              : camera === "blocked"
                ? "Kamera o'lchay olmayapti: kameradan uzoqroq turing, belingiz ham ko'rinsin. Yoki bo'y va vazningizni kiriting."
                : "Bo'y va vazningizni kiriting yoki jonli oynani yoqing: mos o'lchamni taxmin qilamiz."}
          </span>
        ) : recommended ? (
          <>
            <div>
              Sizga taxminan <span className="text-lg font-semibold">{recommended}</span> mos
              {recommendedInStock === false && <span className="text-amber-700"> (omborda yo&apos;q, buyurtma qilsa bo&apos;ladi)</span>}
            </div>
            <div className="mt-0.5 text-xs text-neutral-500">
              {[
                estimate.sources.height && "bo'y",
                estimate.sources.weight && "vazn",
                estimate.sources.camera && "kamera",
              ]
                .filter(Boolean)
                .join(" + ")}{" "}
              bo&apos;yicha
              {cameraNote && ` · ${cameraNote}`}
              {missing.length > 0 && ` · ${missing.join(" va ")} kiritsangiz aniqroq`}
            </div>
          </>
        ) : (
          <span className="text-neutral-600">Bu tovar o&apos;lchamlarini baholab bo&apos;lmadi</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {sizes.map((s) => {
          const fit = fits.get(s.size);
          const active = s.size === chosen;
          return (
            <button
              key={s.size}
              onClick={() => onChoose(s.size)}
              className={`relative rounded-xl border p-2 text-center transition ${
                active ? "border-neutral-900 ring-2 ring-neutral-900" : "border-neutral-200 hover:border-neutral-400"
              } ${s.inStock ? "bg-white" : "bg-neutral-50"}`}
            >
              {s.size === recommended && (
                <span className="absolute -right-1.5 -top-1.5 rounded-full bg-neutral-900 px-1.5 text-[10px] leading-4 text-white">tavsiya</span>
              )}
              <div className="text-base font-semibold">{s.size}</div>
              {fit && (
                <div className="text-[11px] font-medium" style={{ color: FIT_STYLE[fit.overall].color }}>
                  {FIT_LABELS[fit.overall].short}
                </div>
              )}
              <div className={`text-[11px] ${s.inStock ? "text-neutral-500" : "text-amber-700"}`}>{s.inStock ? "bor" : "yo'q"}</div>
            </button>
          );
        })}
      </div>

      {chosenFit && (
        <div className={`rounded-xl px-3 py-2 text-sm ring-1 ${FIT_STYLE[chosenFit.overall].cls}`}>
          <div className="font-medium">
            {chosen}: {FIT_LABELS[chosenFit.overall].text}
          </div>
          <div className="text-xs opacity-80">
            Yelka: {FIT_LABELS[chosenFit.shoulder].short.toLowerCase()} · ko&apos;krak: {FIT_LABELS[chosenFit.chest].short.toLowerCase()}
          </div>
        </div>
      )}

      {chosen && (
        <button
          onClick={onOrder}
          disabled={ordering}
          className={`w-full rounded-xl px-4 py-3 text-sm font-medium text-white disabled:opacity-60 ${
            chosenInStock ? "bg-neutral-900 hover:bg-neutral-700" : "bg-amber-600 hover:bg-amber-700"
          }`}
        >
          {ordering ? "Yuborilmoqda…" : chosenInStock ? `Sotuvchiga ko'rsatish · ${chosen}` : `Buyurtma berish · ${chosen} (omborda yo'q)`}
        </button>
      )}
      {orderError && <p className="text-xs text-red-600">{orderError}</p>}
      <p className="text-[11px] leading-snug text-neutral-400">
        O&apos;lcham taxminiy: kamera masofani bilmaydi, bo&apos;y va vazn uni aniqlashtiradi. Iloji bo&apos;lsa kiyib ko&apos;ring.
      </p>
    </div>
  );
}
