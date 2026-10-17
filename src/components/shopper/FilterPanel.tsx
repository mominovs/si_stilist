"use client";

import { useState } from "react";
import { colorHex } from "@/lib/catalog";

export type Filters = {
  kategoriya: string | null;
  jins: "erkak" | "ayol" | null;
  rang: string | null;
  narx_darajasi: "arzon" | "orta" | "qimmat" | null;
  narx_max: number | null;
  olcham: string | null;
};

const BUDGETS = [
  [200_000, "200 minggacha"],
  [300_000, "300 minggacha"],
  [500_000, "500 minggacha"],
  [1_000_000, "1 mln gacha"],
] as const;

const chip = (active: boolean) => `chip ${active ? "chip-on" : ""}`;

export function FilterPanel({
  categories,
  colors,
  sizes,
  disabled,
  onSearch,
}: {
  categories: string[];
  colors: string[];
  sizes: string[];
  disabled: boolean;
  onSearch: (f: Filters) => void;
}) {
  const [f, setF] = useState<Filters>({
    kategoriya: null,
    jins: null,
    rang: null,
    narx_darajasi: null,
    narx_max: null,
    olcham: null,
  });
  const toggle = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setF((prev) => ({ ...prev, [key]: prev[key] === value ? null : value }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button key={c} type="button" className={chip(f.kategoriya === c)} onClick={() => toggle("kategoriya", c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={chip(f.jins === "erkak")} onClick={() => toggle("jins", "erkak")}>Erkak</button>
        <button type="button" className={chip(f.jins === "ayol")} onClick={() => toggle("jins", "ayol")}>Ayol</button>
        <span className="mx-1 w-px bg-line" />
        <button type="button" className={chip(f.narx_darajasi === "arzon")} onClick={() => toggle("narx_darajasi", "arzon")}>Arzon</button>
        <button type="button" className={chip(f.narx_darajasi === "orta")} onClick={() => toggle("narx_darajasi", "orta")}>O&apos;rta</button>
        <button type="button" className={chip(f.narx_darajasi === "qimmat")} onClick={() => toggle("narx_darajasi", "qimmat")}>Qimmat</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {BUDGETS.map(([amount, label]) => (
          <button key={amount} type="button" className={chip(f.narx_max === amount)} onClick={() => toggle("narx_max", amount)}>
            {label}
          </button>
        ))}
      </div>
      {sizes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sizes.map((s) => (
            <button key={s} type="button" className={chip(f.olcham === s)} onClick={() => toggle("olcham", s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="field-label mb-0 mr-1">Rang</span>
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={c}
            onClick={() => toggle("rang", c)}
            className={`h-8 w-8 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,.12)] transition ${f.rang === c ? "ring-2 ring-accent ring-offset-2" : ""}`}
            style={{ background: colorHex(c) }}
          />
        ))}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSearch(f)}
        className="btn btn-brand w-full"
      >
        Filtr bo&apos;yicha ko&apos;rsatish
      </button>
    </div>
  );
}
