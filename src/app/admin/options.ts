import { prisma } from "@/lib/db";
import { CATEGORIES, COLORS } from "@/lib/catalog";

// Forma uchun takliflar: katalog lug'ati + bazada uchragan qiymatlar
export async function formOptions() {
  const [cats, colors] = await Promise.all([
    prisma.product.findMany({ distinct: ["category"], select: { category: true } }),
    prisma.product.findMany({ distinct: ["color"], select: { color: true } }),
  ]);
  return {
    categoryOptions: [...new Set([...CATEGORIES, ...cats.map((c) => c.category)])].sort(),
    colorOptions: [...new Set([...Object.keys(COLORS), ...colors.map((c) => c.color)])].sort(),
  };
}
