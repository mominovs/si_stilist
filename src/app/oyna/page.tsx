import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { MIRROR_CATEGORIES, colorHex } from "@/lib/catalog";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { priceTiers } from "@/lib/matching";
import { MirrorView, type MirrorCard } from "@/components/mirror/MirrorView";

export const metadata: Metadata = { title: "Jonli oyna · SI Stilist" };

// Real vaqt seansi chegarasi (CLAUDE.md: pullik API'da har soniya pul, standart 60 s). Lokal model bepul bo'lgani
// uchun .env da MIRROR_SESSION_SECONDS bilan uzaytirsa bo'ladi (30..600)
function sessionSeconds(): number {
  const n = Number(process.env.MIRROR_SESSION_SECONDS);
  return Number.isFinite(n) && n >= 30 ? Math.min(600, Math.round(n)) : 60;
}

export default async function MirrorPage({ searchParams }: PageProps<"/oyna">) {
  await connection();
  const sp = await searchParams;
  const wanted = Number(typeof sp.productId === "string" ? sp.productId : NaN);

  // Faqat omborda bor ustki kiyimlar: DM-VTON shular uchun o'qitilgan
  const products = await prisma.product.findMany({
    where: { category: { in: [...MIRROR_CATEGORIES] }, variants: { some: { stock: { gt: 0 } } } },
    include: { variants: { orderBy: { id: "asc" } } },
    orderBy: [{ category: "asc" }, { price: "asc" }],
  });
  const tiers = priceTiers(products);
  const cards: MirrorCard[] = products.map((p) => ({
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

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jonli oyna</h1>
          <p className="text-sm text-neutral-500">Kameraga qarang: kiyim sizda real vaqtda ko&apos;rinadi</p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">← Xaridor ekrani</Link>
      </header>
      {cards.length === 0 ? (
        <p className="text-neutral-500">Omborda ustki kiyim yo&apos;q.</p>
      ) : (
        <MirrorView
          cards={cards}
          initialId={cards.some((c) => c.id === wanted) ? wanted : cards[0].id}
          provider={config.tryOn.provider}
          sessionSeconds={sessionSeconds()}
        />
      )}
    </div>
  );
}
