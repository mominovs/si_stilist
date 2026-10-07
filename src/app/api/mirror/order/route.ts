import { z } from "zod";
import type { ReserveResponse } from "@/app/api/reserve/route";
import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { withDefaults } from "@/lib/query/schema";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const SIZE = z.string().regex(/^[A-Z0-9]{1,5}$/);
const bodySchema = z.object({
  productId: z.number().int().positive(),
  size: SIZE,
  /** Jonli oyna tavsiya qilgan o'lcham (bo'lsa): panelda sinov aniqligi shu bilan hisoblanadi */
  recommended: SIZE.nullable().optional(),
});

/**
 * Jonli oynadan "Sotuvchiga ko'rsatish" yoki "Buyurtma berish": tanlangan tovar va o'lcham so'rov sifatida logga
 * yoziladi (mode "oyna"). Omborda yo'q o'lcham ham qabul qilinadi: u panelda qoniqtirilmagan talab ("tugagan",
 * o'lchami bilan) bo'lib chiqadi. Xaridorning bo'yi, vazni va kamera o'lchovi saqlanmaydi, faqat o'lchamlar.
 */
export async function POST(request: Request) {
  if (!rateLimit(`mirror-order:${clientKey(request)}`, 10).ok) {
    return Response.json({ error: "Juda tez-tez" }, { status: 429 });
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "So'rov noto'g'ri" }, { status: 400 });
  const { productId, size, recommended } = body.data;

  const product = await prisma.product.findUnique({ where: { id: productId }, include: { variants: true } });
  const variant = product?.variants.find((v) => v.size === size);
  if (!product || !variant) return Response.json({ error: "Bunday tovar yoki o'lcham yo'q" }, { status: 404 });
  const inStock = variant.stock > 0;

  const parsed = withDefaults({
    kategoriya: product.category,
    jins: product.gender === "unisex" ? null : product.gender,
    ranglar: [product.color],
    olcham: size,
    izoh: inStock ? "Jonli oynada tanlangan" : "Jonli oynada tanlangan, o'lcham omborda yo'q",
  });
  const created = await prisma.request.create({
    data: {
      rawText: `Jonli oyna: ${product.name}, ${size} o'lcham${inStock ? "" : " (omborda yo'q)"}`,
      parsed,
      mode: "oyna",
      resultCount: inStock ? 1 : 0,
      status: inStock ? "qoniqtirildi" : "qoniqtirilmadi",
      results: {
        create: {
          productId,
          rank: 1,
          reservedAt: new Date(),
          reservedSize: size,
          recommendedSize: recommended && product.variants.some((v) => v.size === recommended) ? recommended : null,
        },
      },
    },
  });

  const res: ReserveResponse = {
    code: String(created.id),
    name: product.name,
    sku: product.sku,
    color: product.color,
    size,
    priceLabel: formatPrice(product.price),
    ordered: !inStock,
  };
  return Response.json(res);
}
