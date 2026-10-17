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
  // color: kamera kadri ustidagi strelkalar (yorqin, har qanday fonda ko'rinsin); cls: panel ichidagi belgi
  "juda-tor": { color: "#F2685C", cls: "bg-danger-soft text-danger" },
  tor: { color: "#F2A40F", cls: "bg-warning-soft text-warning" },
  mos: { color: "#2FA866", cls: "bg-success-soft text-success" },
  keng: { color: "#F2A40F", cls: "bg-warning-soft text-warning" },
  "juda-keng": { color: "#F2685C", cls: "bg-danger-soft text-danger" },
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
    <div className="card space-y-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-extrabold text-brand">O&apos;lcham</h2>
        <span className="badge badge-warn">
          Taxminiy{estimate ? ` · aniqlik ${CONFIDENCE_LABEL[estimate.confidence]}` : ""}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="field-label mb-0">
          Bo&apos;y (sm)
          <input
            inputMode="numeric"
            value={form.height}
            onChange={(e) => onForm({ ...form, height: e.target.value.replace(/[^\d.,]/g, "").slice(0, 5) })}
            placeholder="175"
            className={`field mt-2 ${outOf(form.height, HEIGHT_RANGE) ? "border-danger" : ""}`}
          />
        </label>
        <label className="field-label mb-0">
          Vazn (kg)
          <input
            inputMode="numeric"
            value={form.weight}
            onChange={(e) => onForm({ ...form, weight: e.target.value.replace(/[^\d.,]/g, "").slice(0, 5) })}
            placeholder="70"
            className={`field mt-2 ${outOf(form.weight, WEIGHT_RANGE) ? "border-danger" : ""}`}
          />
        </label>
        <div className="field-label col-span-2 mb-0 sm:col-span-1">
          Siz
          <div className="mt-2 flex min-h-12 rounded-full bg-surface-2 p-1 shadow-[inset_0_0_0_1.5px_var(--color-line)]">
            {(["erkak", "ayol"] as const).map((g) => (
              <button
                key={g}
                onClick={() => onForm({ ...form, gender: g })}
                className={`flex-1 rounded-full px-4 text-sm font-bold ${form.gender === g ? "bg-brand text-white" : "text-muted"}`}
              >
                {g === "erkak" ? "Erkak" : "Ayol"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs font-medium text-muted">
        Ixtiyoriy. Bo&apos;y va vazningizni kiritsangiz, o&apos;lcham aniqroq ko&apos;rsatiladi. Ma&apos;lumotlar saqlanmaydi.
      </p>

      <div className="rounded-2xl bg-surface-2 p-3 text-sm font-medium">
        {!estimate ? (
          <span className="text-muted">
            {camera === "measuring"
              ? "Kamera o'lchamoqda: to'g'ri turing, yelkalaringiz va belingiz ko'rinsin…"
              : camera === "blocked"
                ? "Kamera o'lchay olmayapti: kameradan uzoqroq turing, belingiz ham ko'rinsin. Yoki bo'y va vazningizni kiriting."
                : "Bo'y va vazningizni kiriting yoki jonli oynani yoqing: mos o'lchamni taxmin qilamiz."}
          </span>
        ) : recommended ? (
          <>
            <div>
              <span className="font-bold text-ink">Tavsiya:</span>{" "}
              <span className="font-display text-2xl font-extrabold text-accent">{recommended}</span>
              {recommendedInStock === false && <span className="text-warning"> (omborda yo&apos;q, buyurtma qilsa bo&apos;ladi)</span>}
            </div>
            <div className="mt-0.5 text-xs text-muted">
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
          <span className="text-muted">Bu tovar o&apos;lchamlarini baholab bo&apos;lmadi</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {sizes.map((s) => {
          const fit = fits.get(s.size);
          const active = s.size === chosen;
          return (
            <button
              key={s.size}
              onClick={() => onChoose(s.size)}
              className={`relative rounded-2xl p-2.5 text-center transition ${
                active
                  ? "bg-brand text-white"
                  : `${s.inStock ? "bg-surface" : "bg-surface-2"} shadow-[inset_0_0_0_1.5px_var(--color-line)] hover:shadow-[inset_0_0_0_1.5px_var(--color-brand)]`
              }`}
            >
              {s.size === recommended && (
                <span className="absolute -right-1.5 -top-2 rounded-full bg-accent px-1.5 text-[10px] font-bold leading-4 text-white">tavsiya</span>
              )}
              <div className="font-display text-base font-extrabold">{s.size}</div>
              {fit && (
                <div className={`text-[11px] font-bold ${active ? "text-white/85" : FIT_STYLE[fit.overall].cls.split(" ")[1]}`}>
                  {FIT_LABELS[fit.overall].short}
                </div>
              )}
              <div className={`text-[11px] font-semibold ${active ? "text-white/70" : s.inStock ? "text-muted" : "text-warning"}`}>
                {s.inStock ? "bor" : "yo'q"}
              </div>
            </button>
          );
        })}
      </div>

      {chosenFit && (
        <div className={`rounded-2xl px-4 py-2.5 text-sm ${FIT_STYLE[chosenFit.overall].cls}`}>
          <div className="font-bold">
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
          className={`btn btn-lg w-full ${chosenInStock ? "btn-brand" : "bg-warning text-white hover:opacity-90"}`}
        >
          {ordering ? "Yuborilmoqda…" : chosenInStock ? `Sotuvchiga ko'rsatish · ${chosen}` : `Buyurtma berish · ${chosen} (omborda yo'q)`}
        </button>
      )}
      {orderError && <p className="text-xs font-semibold text-danger">{orderError}</p>}
      <p className="text-[11px] leading-snug text-muted">
        O&apos;lcham taxminiy: kamera masofani bilmaydi, bo&apos;y va vazn uni aniqlashtiradi. Iloji bo&apos;lsa kiyib ko&apos;ring.
      </p>
    </div>
  );
}
