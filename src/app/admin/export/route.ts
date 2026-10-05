import { prisma } from "@/lib/db";
import { productsToCsv } from "@/lib/csv";

// Joriy omborni CSV sifatida yuklab olish (import uchun namuna sifatida ham ishlatiladi)
export async function GET() {
  const products = await prisma.product.findMany({
    orderBy: { id: "asc" },
    include: { variants: { orderBy: { id: "asc" } } },
  });
  // BOM: Excel o'zbekcha harflarni to'g'ri ochishi uchun
  return new Response("﻿" + productsToCsv(products), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="si-stilist-tovarlar.csv"',
    },
  });
}
