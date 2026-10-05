import Link from "next/link";
import { after, connection } from "next/server";
import { prisma } from "@/lib/db";
import { COLORS } from "@/lib/catalog";
import { llmConfigured, warmUpLlm } from "@/lib/query/llm";
import { loadVocabulary } from "@/lib/search";
import { Shopper } from "@/components/shopper/Shopper";

export default async function ShopperPage() {
  await connection();
  // Javob yuborilgandan keyin fonda: xaridorning birinchi so'rovi tez qaytishi uchun
  after(() => warmUpLlm(loadVocabulary));
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
        <div className="flex items-center gap-4">
          {llmConfigured() ? (
            <span className="flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-sm font-medium text-violet-800">
              <span className="h-2 w-2 rounded-full bg-violet-600" />
              SI yoqilgan
            </span>
          ) : (
            <span
              title=".env faylida ANTHROPIC_API_KEY yo'q"
              className="flex items-center gap-2 rounded-full bg-neutral-200 px-3 py-1 text-sm text-neutral-600"
            >
              <span className="h-2 w-2 rounded-full bg-neutral-400" />
              Oddiy rejim (SI kaliti yo&apos;q)
            </span>
          )}
          <Link href="/panel" className="text-sm text-neutral-400 hover:text-neutral-700">Do&apos;kon paneli</Link>
          <Link href="/admin" className="text-sm text-neutral-400 hover:text-neutral-700">Admin</Link>
        </div>
      </header>
      <Shopper categories={cats.map((c) => c.category)} colors={sortedColors} />
    </div>
  );
}
