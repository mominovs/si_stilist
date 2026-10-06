import { COLORS, SEASONS } from "@/lib/catalog";
import { detectCategory, detectColor, normalizeText } from "./keywords";
import type { ParsedQuery } from "./schema";

// Tashqi (LLM) qiymatlarni tozalash: faqat harf, raqam, apostrof, chiziqcha va bo'sh joy, uzunlik cheklangan.
// Shunda g'alati yoki zararli matn do'kon analitikasiga tushmaydi.
function clean(value: string, maxLen: number): string {
  return normalizeText(value)
    .replace(/[^\p{L}\p{N}' -]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen)
    .trim();
}

const lower = (s: string) => clean(s, 30);
const MAX_LIST = 5;

function normalizeCategory(value: string | null, known: string[]): string | null {
  if (!value) return null;
  const v = lower(value);
  if (!v) return null;
  if (known.includes(v)) return v;
  // "костюм", "kostyumlar" kabi shakllar lug'atga moslanadi; topilmasa so'ralgan holicha saqlanadi.
  // Kategoriya nomi uzun gap bo'lmasligi kerak (ko'pi bilan 3 so'z)
  return detectCategory(v) ?? (v.split(" ").length <= 3 ? v : null);
}

function normalizeColor(value: string): string {
  const v = clean(value, 20);
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

const unique = (xs: string[]) => [...new Set(xs.filter(Boolean))].slice(0, MAX_LIST);

function normalizeSize(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim().toUpperCase().replace(/^2XL$/, "XXL").replace(/^3XL$/, "XXXL");
  return /^[A-Z0-9]{1,5}$/.test(v) ? v : null;
}

function normalizeBudget(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  // LLM ba'zan "300 ming" ni 300 deb yozadi
  const v = value < 1000 ? value * 1000 : value;
  return v <= 1_000_000_000 ? Math.round(v) : null;
}

/** LLM yoki zaxira tahlilchi natijasini bazadagi qiymatlar bilan bir xil ko'rinishga keltiradi */
export function normalizeQuery(q: ParsedQuery, knownCategories: string[]): ParsedQuery {
  const exclude = unique(q.rang_istisno.slice(0, MAX_LIST).map(normalizeColor));
  return {
    ...q,
    kategoriya: normalizeCategory(q.kategoriya, knownCategories),
    ranglar: unique(q.ranglar.slice(0, MAX_LIST).map(normalizeColor)).filter((c) => !exclude.includes(c)),
    rang_istisno: exclude,
    uslub: unique(q.uslub.slice(0, MAX_LIST).map(lower)),
    maqsad: q.maqsad ? lower(q.maqsad) || null : null,
    narx_max: normalizeBudget(q.narx_max),
    olcham: normalizeSize(q.olcham),
    mavsum: normalizeSeason(q.mavsum),
    // Faqat ko'rsatish uchun: boshqaruv belgilari olib tashlanadi, uzunlik cheklanadi
    izoh: q.izoh.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200),
  };
}
