import { COLORS, SEASONS } from "@/lib/catalog";
import { detectCategory, detectColor, normalizeText } from "./keywords";
import type { ParsedQuery } from "./schema";

const lower = (s: string) => normalizeText(s);

function normalizeCategory(value: string | null, known: string[]): string | null {
  if (!value) return null;
  const v = lower(value);
  if (known.includes(v)) return v;
  // "костюм", "kostyumlar" kabi shakllar lug'atga moslanadi; topilmasa so'ralgan holicha saqlanadi
  return detectCategory(v) ?? v;
}

function normalizeColor(value: string): string {
  const v = lower(value);
  if (v in COLORS) return v;
  return detectColor(v) ?? v;
}

function normalizeSeason(value: string | null): string | null {
  if (!value) return null;
  const v = lower(value);
  if ((SEASONS as readonly string[]).includes(v)) return v === "hamma" ? null : v;
  if (/qish|зим/.test(v)) return "qish";
  if (/yoz|лет/.test(v)) return "yoz";
  if (/bahor|kuz|весн|осен/.test(v)) return "bahor-kuz";
  return null;
}

const unique = (xs: string[]) => [...new Set(xs.filter(Boolean))];

/** LLM yoki zaxira tahlilchi natijasini bazadagi qiymatlar bilan bir xil ko'rinishga keltiradi */
export function normalizeQuery(q: ParsedQuery, knownCategories: string[]): ParsedQuery {
  const exclude = unique(q.rang_istisno.map(normalizeColor));
  return {
    ...q,
    kategoriya: normalizeCategory(q.kategoriya, knownCategories),
    ranglar: unique(q.ranglar.map(normalizeColor)).filter((c) => !exclude.includes(c)),
    rang_istisno: exclude,
    uslub: unique(q.uslub.map(lower)),
    maqsad: q.maqsad ? lower(q.maqsad) : null,
    olcham: q.olcham ? q.olcham.trim().toUpperCase() : null,
    mavsum: normalizeSeason(q.mavsum),
    izoh: q.izoh.trim(),
  };
}
