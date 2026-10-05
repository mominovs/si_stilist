"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { FormState } from "@/app/admin/actions";
import {
  GENDERS,
  GENDER_LABELS,
  LETTER_SIZES,
  NUMERIC_SIZES,
  SEASONS,
  SEASON_LABELS,
  STYLE_TAGS,
  colorHex,
} from "@/lib/catalog";

export type ProductFormValues = {
  sku: string;
  name: string;
  category: string;
  gender: string;
  color: string;
  styleTags: string[];
  season: string;
  price: number | "";
  imageUrl: string;
  description: string;
  variants: { size: string; stock: number }[];
};

const EMPTY: ProductFormValues = {
  sku: "",
  name: "",
  category: "",
  gender: "",
  color: "",
  styleTags: [],
  season: "hamma",
  price: "",
  imageUrl: "",
  description: "",
  variants: [{ size: "M", stock: 1 }],
};

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial?: ProductFormValues;
  categoryOptions: string[];
  colorOptions: string[];
};

const inputCls = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none";

function Field({ label, error, children }: { label: string; error?: string[]; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      {children}
      {error?.map((e) => (
        <span key={e} className="block text-xs text-red-600">{e}</span>
      ))}
    </label>
  );
}

export function ProductForm({ action, initial = EMPTY, categoryOptions, colorOptions }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const [variants, setVariants] = useState(initial.variants);
  const [color, setColor] = useState(initial.color);
  const [imageUrl, setImageUrl] = useState(initial.imageUrl);
  const err = state.fieldErrors ?? {};
  // Xatodan keyin forma qayta chiziladi (key) va yuborilgan qiymatlar bilan to'ldiriladi
  const v = { ...initial, ...state.values };

  const setVariant = (i: number, patch: Partial<{ size: string; stock: number }>) =>
    setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  const fillSizes = (sizes: string[]) => setVariants(sizes.map((size) => ({ size, stock: 0 })));

  return (
    <form key={state.submittedAt ?? 0} action={formAction} className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <div className="space-y-5">
        {state.message && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.message}</div>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
          <Field label="Nomi" error={err.name}>
            <input name="name" defaultValue={v.name} required className={inputCls} placeholder="Masalan: Oq klassik ko'ylak" />
          </Field>
          <Field label="SKU (ixtiyoriy)" error={err.sku}>
            <input name="sku" defaultValue={v.sku} className={inputCls} placeholder="KY-07" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Kategoriya" error={err.category}>
            <input name="category" list="category-options" defaultValue={v.category} required className={inputCls} />
            <datalist id="category-options">
              {categoryOptions.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>
          <Field label="Jins" error={err.gender}>
            <select name="gender" defaultValue={v.gender} required className={inputCls}>
              <option value="" disabled>Tanlang</option>
              {GENDERS.map((g) => <option key={g} value={g}>{GENDER_LABELS[g]}</option>)}
            </select>
          </Field>
          <Field label="Rang" error={err.color}>
            <div className="flex items-center gap-2">
              <span className="h-8 w-8 shrink-0 rounded-full border border-neutral-300" style={{ background: colorHex(color) }} />
              <input name="color" list="color-options" value={color} onChange={(e) => setColor(e.target.value)} required className={inputCls} />
            </div>
            <datalist id="color-options">
              {colorOptions.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Narx (so'm)" error={err.price}>
            <input name="price" type="number" min={1} step={1} defaultValue={v.price} required className={inputCls} />
          </Field>
          <Field label="Mavsum" error={err.season}>
            <select name="season" defaultValue={v.season} className={inputCls}>
              {SEASONS.map((s) => <option key={s} value={s}>{SEASON_LABELS[s]}</option>)}
            </select>
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-neutral-700">Uslub va maqsad</legend>
          <div className="flex flex-wrap gap-2">
            {STYLE_TAGS.map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm has-[:checked]:border-neutral-900 has-[:checked]:bg-neutral-900 has-[:checked]:text-white">
                <input type="checkbox" name="styleTags" value={t} defaultChecked={v.styleTags.includes(t)} className="sr-only" />
                {t}
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Rasm manzili" error={err.imageUrl}>
          <input name="imageUrl" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} required className={inputCls} placeholder="/products/ky-07.jpg yoki https://..." />
          <span className="block text-xs text-neutral-500">Oq fondagi aniq rasm. Lokal fayllar public/products/ papkasiga qo&apos;yiladi.</span>
        </Field>

        <Field label="Tavsif (ixtiyoriy)" error={err.description}>
          <textarea name="description" defaultValue={v.description} rows={2} className={inputCls} />
        </Field>

        <fieldset className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <legend className="text-sm font-medium text-neutral-700">O&apos;lchamlar va qoldiq</legend>
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={() => fillSizes(LETTER_SIZES)} className="rounded border border-neutral-300 bg-white px-2 py-1 hover:bg-neutral-50">XS–XXL</button>
              <button type="button" onClick={() => fillSizes(NUMERIC_SIZES)} className="rounded border border-neutral-300 bg-white px-2 py-1 hover:bg-neutral-50">44–54</button>
            </div>
          </div>
          <input type="hidden" name="variants" value={JSON.stringify(variants)} />
          <div className="space-y-2">
            {variants.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={v.size} onChange={(e) => setVariant(i, { size: e.target.value })} placeholder="O'lcham" className={`${inputCls} w-28`} />
                <input type="number" min={0} value={v.stock} onChange={(e) => setVariant(i, { stock: Number(e.target.value) })} className={`${inputCls} w-28`} />
                <span className="text-xs text-neutral-400">dona</span>
                <button type="button" onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))} className="ml-auto text-sm text-neutral-400 hover:text-red-600" aria-label="O'chirish">
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setVariants((vs) => [...vs, { size: "", stock: 0 }])} className="text-sm text-neutral-600 hover:underline">
            + O&apos;lcham qo&apos;shish
          </button>
          {err.variants?.map((e) => <span key={e} className="block text-xs text-red-600">{e}</span>)}
        </fieldset>

        <div className="flex gap-3 pt-2">
          <button disabled={pending} className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50">
            {pending ? "Saqlanmoqda..." : "Saqlash"}
          </button>
          <Link href="/admin" className="rounded-lg px-5 py-2.5 text-sm text-neutral-600 hover:bg-neutral-100">Bekor qilish</Link>
        </div>
      </div>

      <aside className="space-y-2">
        <div className="text-sm font-medium text-neutral-700">Rasm</div>
        <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-sm text-neutral-400">Rasm yo&apos;q</span>
          )}
        </div>
      </aside>
    </form>
  );
}
