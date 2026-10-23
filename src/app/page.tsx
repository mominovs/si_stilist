import Link from "next/link";
import { after, connection } from "next/server";
import { prisma } from "@/lib/db";
import { COLORS } from "@/lib/catalog";
import { llmConfigured, warmUpLlm } from "@/lib/query/llm";
import { config } from "@/lib/config";
import { demoSettings } from "@/lib/demo-settings";
import { loadCities, loadVocabulary } from "@/lib/search";
import { SiteHeader, StatusPill } from "@/components/brand/SiteHeader";
import { SampleStoresNote } from "@/components/brand/SampleStoresNote";
import { Shopper } from "@/components/shopper/Shopper";

export default async function ShopperPage() {
  await connection();
  // Javob yuborilgandan keyin fonda: xaridorning birinchi so'rovi tez qaytishi uchun
  after(() => warmUpLlm(loadVocabulary));
  // Filtr tugmalari faqat omborda uchraydigan qiymatlardan tuziladi
  const [cats, colors, sizes, cities] = await Promise.all([
    prisma.product.findMany({ distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } }),
    prisma.product.findMany({ distinct: ["color"], select: { color: true } }),
    prisma.productVariant.findMany({ where: { stock: { gt: 0 } }, distinct: ["size"], select: { size: true } }),
    loadCities(),
  ]);
  const letterOrder = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
  const sortedSizes = sizes
    .map((s) => s.size)
    .sort((a, b) => {
      const la = letterOrder.indexOf(a);
      const lb = letterOrder.indexOf(b);
      if (la !== -1 || lb !== -1) return (la === -1 ? 99 : la) - (lb === -1 ? 99 : lb);
      return Number(a) - Number(b) || a.localeCompare(b);
    });
  const colorOrder = Object.keys(COLORS);
  const sortedColors = colors
    .map((c) => c.color)
    .sort((a, b) => (colorOrder.indexOf(a) + 1 || 99) - (colorOrder.indexOf(b) + 1 || 99));

  const status = demoSettings.llmOff ? (
    <StatusPill tone="warn" title="Demo holati sahifasida SI qo'lda o'chirilgan">
      Zaxira rejim
    </StatusPill>
  ) : llmConfigured() ? (
    <StatusPill tone="ok">SI tayyor</StatusPill>
  ) : (
    <StatusPill tone="off" title=".env faylida ANTHROPIC_API_KEY yo'q">
      Oddiy rejim
    </StatusPill>
  );

  return (
    <>
      <SiteHeader
        active="stilist"
        status={status}
        extra={
          <Link href="/admin" prefetch={false} className="hidden rounded-full px-3 py-2 text-sm font-bold text-muted hover:bg-brand-soft md:block">
            Admin
          </Link>
        }
      />
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        <div className="sm:hidden">{status}</div>
        <Shopper
          categories={cats.map((c) => c.category)}
          colors={sortedColors}
          sizes={sortedSizes}
          cities={cities}
          tryOnProvider={config.tryOn.provider}
        />
        {cities.length > 0 && <SampleStoresNote />}
      </div>
    </>
  );
}
