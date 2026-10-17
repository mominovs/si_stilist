import { MIRROR_CATEGORIES, colorHex } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { priceTiers } from "@/lib/matching";
import type { MirrorCard } from "@/components/mirror/MirrorView";

/** Jonli oyna tovarlari: faqat omborda bor ustki kiyimlar (DM-VTON shular uchun o'qitilgan). /oyna va /efir */
export async function mirrorCards(): Promise<MirrorCard[]> {
  const products = await prisma.product.findMany({
    where: { category: { in: [...MIRROR_CATEGORIES] }, variants: { some: { stock: { gt: 0 } } } },
    include: { variants: { orderBy: { id: "asc" } } },
    orderBy: [{ category: "asc" }, { price: "asc" }],
  });
  const tiers = priceTiers(products);
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    color: p.color,
    colorHex: colorHex(p.color),
    price: p.price,
    priceLabel: formatPrice(p.price),
    tier: tiers.get(p.id) ?? "orta",
    imageUrl: p.imageUrl,
    isExact: true,
    reason: null,
    sizes: p.variants.map((v) => ({ size: v.size, inStock: v.stock > 0 })),
    gender: p.gender,
  }));
}

// Real vaqt seansi chegarasi (CLAUDE.md: pullik API'da har soniya pul, standart 60 s). Lokal model bepul bo'lgani
// uchun .env da MIRROR_SESSION_SECONDS bilan uzaytirsa bo'ladi (30..600)
export function sessionSeconds(): number {
  const n = Number(process.env.MIRROR_SESSION_SECONDS);
  return Number.isFinite(n) && n >= 30 ? Math.min(600, Math.round(n)) : 60;
}
