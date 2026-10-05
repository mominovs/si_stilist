import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/db";
import { COLORS } from "@/lib/catalog";
import { Shopper } from "@/components/shopper/Shopper";

export default async function ShopperPage() {
  await connection();
  // Filtr tugmalari faqat omborda uchraydigan qiymatlardan tuziladi
  const [cats, colors] = await Promise.all([
    prisma.product.findMany({ distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } }),
    prisma.product.findMany({ distinct: ["color"], select: { color: true } }),
  ]);
  const colorOrder = Object.keys(COLORS);
  const sortedColors = colors
    .map((c) => c.color)
    .sort((a, b) => (colorOrder.indexOf(a) + 1 || 99) - (colorOrder.indexOf(b) + 1 || 99));

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">SI Stilist</h1>
          <p className="text-sm text-neutral-500">Omborda bor tovarlardan sizga mosini topamiz</p>
        </div>
        <Link href="/admin" className="text-sm text-neutral-400 hover:text-neutral-700">Admin</Link>
      </header>
      <Shopper categories={cats.map((c) => c.category)} colors={sortedColors} />
    </div>
  );
}
