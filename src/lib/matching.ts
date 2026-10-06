// Moslashtirish: toza, deterministik funksiya. LLM bu yerda ishtirok etmaydi.
// Faqat berilgan ro'yxatdagi (ombordagi) tovarlar qaytariladi.

import type { ParsedQuery } from "@/lib/query/schema";

export type PriceTier = "arzon" | "orta" | "qimmat";

export type MatchProduct = {
  id: number;
  category: string;
  gender: "erkak" | "ayol" | "unisex";
  color: string;
  styleTags: string[];
  season: string;
  price: number;
  variants: { size: string; stock: number }[];
};

export type MatchStatus = "qoniqtirildi" | "qisman" | "qoniqtirilmadi";

export type MatchResult<P extends MatchProduct> = {
  product: P;
  score: number;
  isExact: boolean;
  /** Aniq mos bo'lmasa, nima farq qilishi (xaridorga ko'rsatiladi) */
  reason: string | null;
  tier: PriceTier;
};

const TIER_ORDER: PriceTier[] = ["arzon", "orta", "qimmat"];

/** Har bir kategoriya ichida narx bo'yicha uchga bo'linadi */
export function priceTiers(products: MatchProduct[]): Map<number, PriceTier> {
  const byCategory = new Map<string, MatchProduct[]>();
  for (const p of products) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }
  const tiers = new Map<number, PriceTier>();
  for (const list of byCategory.values()) {
    const sorted = [...list].sort((a, b) => a.price - b.price || a.id - b.id);
    sorted.forEach((p, i) => {
      tiers.set(p.id, TIER_ORDER[Math.min(2, Math.floor((i * 3) / sorted.length))]);
    });
  }
  return tiers;
}

const inStock = (p: MatchProduct) => p.variants.some((v) => v.stock > 0);

export function matchProducts<P extends MatchProduct>(
  products: P[],
  q: ParsedQuery,
  limit = 3,
): { results: MatchResult<P>[]; status: MatchStatus } {
  const tiers = priceTiers(products);
  const styleTags = q.uslub.filter((t) => t !== q.maqsad);

  // Qattiq filtrlar: kategoriya, jins, istisno ranglar, qoldiq > 0
  const candidates = products.filter(
    (p) =>
      (!q.kategoriya || p.category === q.kategoriya) &&
      (!q.jins || p.gender === q.jins || p.gender === "unisex") &&
      !q.rang_istisno.includes(p.color) &&
      inStock(p),
  );

  const scored = candidates.map((p): MatchResult<P> => {
    const tier = tiers.get(p.id) ?? "orta";
    let score = 0;
    const reasons: string[] = [];

    if (q.ranglar.length > 0) {
      if (q.ranglar.includes(p.color)) score += 5;
      else reasons.push("Shu rangda yo'q, o'xshashi bor");
    }

    // Maqsad (ish, bayram...) aniq mos bo'lishi shart; uslubdan kamida bittasi.
    // "Klassik, bayram uchun" so'ralganda faqat "klassik" tovar aniq mos hisoblanmaydi
    if (q.maqsad) {
      if (p.styleTags.includes(q.maqsad)) score += 3;
      else reasons.push(`${q.maqsad[0].toUpperCase()}${q.maqsad.slice(1)} uchun emas, o'xshashi bor`);
    }
    if (styleTags.length > 0) {
      const hits = styleTags.filter((t) => p.styleTags.includes(t)).length;
      score += hits * 3;
      if (hits === 0) reasons.push("Boshqa uslubda, o'xshashi bor");
    }

    if (q.narx_darajasi) {
      const distance = Math.abs(TIER_ORDER.indexOf(tier) - TIER_ORDER.indexOf(q.narx_darajasi));
      if (distance === 0) score += 3;
      else {
        if (distance === 1) score += 1;
        reasons.push(tier === "qimmat" || (tier === "orta" && q.narx_darajasi === "arzon")
          ? "Narxi biroz yuqoriroq"
          : "Narxi arzonroq");
      }
    }

    if (q.narx_max) {
      if (p.price <= q.narx_max) score += 2;
      else {
        score -= 4;
        reasons.push("Byudjetdan qimmatroq");
      }
    }

    if (q.mavsum) {
      if (p.season === q.mavsum) score += 2;
      else if (p.season === "hamma") score += 1;
      else reasons.push("Boshqa mavsum uchun");
    }

    if (q.olcham) {
      const v = p.variants.find((x) => x.size === q.olcham);
      if (v && v.stock > 0) score += 2;
      else reasons.push(`${q.olcham} o'lchami tugagan`);
    }

    return { product: p, score, isExact: reasons.length === 0, reason: reasons[0] ?? null, tier };
  });

  const byScore = (a: MatchResult<P>, b: MatchResult<P>) =>
    b.score - a.score || a.product.price - b.product.price || a.product.id - b.product.id;

  const exact = scored.filter((r) => r.isExact).sort(byScore);
  const near = scored.filter((r) => !r.isExact).sort(byScore);
  // Aniq moslar avval; kam bo'lsa yaqin variantlar bilan to'ldiriladi
  const results = [...exact, ...near].slice(0, limit);

  const status: MatchStatus =
    results.length === 0 ? "qoniqtirilmadi" : results.some((r) => r.isExact) ? "qoniqtirildi" : "qisman";

  return { results, status };
}
