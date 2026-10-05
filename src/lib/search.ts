import { prisma } from "@/lib/db";
import { CATEGORIES, COLORS, SEASONS, STYLE_TAGS, colorHex } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { matchProducts, type MatchStatus, type PriceTier } from "@/lib/matching";
import type { ParseMode, ParsedQuery, Vocabulary } from "@/lib/query";

export async function loadVocabulary(): Promise<Vocabulary> {
  const [cats, colors] = await Promise.all([
    prisma.product.findMany({ distinct: ["category"], select: { category: true } }),
    prisma.product.findMany({ distinct: ["color"], select: { color: true } }),
  ]);
  return {
    categories: [...new Set([...CATEGORIES, ...cats.map((c) => c.category)])],
    colors: [...new Set([...Object.keys(COLORS), ...colors.map((c) => c.color)])],
    styleTags: [...STYLE_TAGS],
    seasons: SEASONS.filter((s) => s !== "hamma"),
  };
}

export type ResultCard = {
  id: number;
  name: string;
  category: string;
  color: string;
  colorHex: string;
  price: number;
  priceLabel: string;
  tier: PriceTier;
  imageUrl: string;
  isExact: boolean;
  reason: string | null;
  sizes: { size: string; inStock: boolean }[];
};

export type SearchResponse = {
  requestId: number;
  mode: ParseMode;
  parsed: ParsedQuery | null;
  status: MatchStatus;
  message: string;
  /** SI ishlamagan bo'lsa sababi (masalan, "API kalit noto'g'ri") */
  llmError?: string;
  results: ResultCard[];
};

function replyMessage(status: MatchStatus, parsed: ParsedQuery | null, count: number, mode: ParseMode): string {
  if (mode === "rad") {
    return "Men faqat kiyim tanlashda yordam bera olaman. Masalan: \"bayramga ko'k ko'ylak\" deb yozing.";
  }
  if (!parsed) return "Qanday kiyim kerakligini aniqroq yozing (turi, rangi yoki qayerga kiyishingiz) yoki filtrdan tanlang.";
  if (status === "qoniqtirildi") return `Sizga mos ${count} ta variant topdim.`;
  if (status === "qisman") return "Aynan shunday tovar hozir yo'q, lekin o'xshashlari bor.";
  const what = parsed.kategoriya ? `"${parsed.kategoriya}"` : "bunday tovar";
  return `Afsuski, ${what} hozir omborda yo'q. So'rovingizni do'konga yetkazdik.`;
}

/** Moslashtiradi, so'rovni logga yozadi va xaridor ekrani uchun javob tayyorlaydi */
export async function runSearch(
  rawText: string,
  parsed: ParsedQuery | null,
  mode: ParseMode,
  llmError?: string,
): Promise<SearchResponse> {
  const products = await prisma.product.findMany({
    include: { variants: { orderBy: { id: "asc" } } },
  });

  const { results, status } = parsed
    ? matchProducts(products, parsed)
    : { results: [], status: "qoniqtirilmadi" as const };

  // Har bir so'rov saqlanadi: do'kon paneli va qoniqtirilmagan talab shu ma'lumotdan quriladi
  const request = await prisma.request.create({
    data: {
      rawText,
      parsed: parsed ?? undefined,
      mode,
      resultCount: results.length,
      status,
      results: {
        create: results.map((r, i) => ({ productId: r.product.id, rank: i + 1, isExact: r.isExact })),
      },
    },
    select: { id: true },
  });

  return {
    requestId: request.id,
    mode,
    parsed,
    status,
    message: replyMessage(status, parsed, results.length, mode),
    llmError,
    results: results.map(({ product: p, isExact, reason, tier }) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      color: p.color,
      colorHex: colorHex(p.color),
      price: p.price,
      priceLabel: formatPrice(p.price),
      tier,
      imageUrl: p.imageUrl,
      isExact,
      reason,
      sizes: p.variants.map((v) => ({ size: v.size, inStock: v.stock > 0 })),
    })),
  };
}
