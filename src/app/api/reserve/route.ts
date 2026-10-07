import { z } from "zod";
import { prisma } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  requestId: z.number().int().positive(),
  productId: z.number().int().positive(),
  size: z.string().regex(/^[A-Z0-9]{1,5}$/),
});

export type ReserveResponse = {
  /** Sotuvchi panelda shu raqam bo'yicha topadi */
  code: string;
  name: string;
  sku: string | null;
  color: string;
  size: string;
  priceLabel: string;
  /** Omborda yo'q o'lcham: sotuvchi buyurtma qiladi (jonli oynadan) */
  ordered?: boolean;
};

/**
 * "Sotuvchiga ko'rsatish": xaridor tanlagan tovar va o'lcham belgilanadi, panelda sotuvchiga ko'rinadi.
 * Faqat shu so'rovda ko'rsatilgan tovar va omborda bor o'lcham qabul qilinadi.
 */
export async function POST(request: Request) {
  if (!rateLimit(`reserve:${clientKey(request)}`, 20).ok) {
    return Response.json({ error: "Juda tez-tez" }, { status: 429 });
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "So'rov noto'g'ri" }, { status: 400 });
  const { requestId, productId, size } = body.data;

  const shown = await prisma.requestResult.findFirst({
    where: { requestId, productId, request: { createdAt: { gte: new Date(Date.now() - 2 * 3600_000) } } },
    include: { product: { include: { variants: { where: { size } } } } },
  });
  if (!shown) return Response.json({ error: "Bu tovar shu so'rovda ko'rsatilmagan" }, { status: 404 });
  if (!shown.product.variants.some((v) => v.stock > 0)) {
    return Response.json({ error: `${size} o'lchami omborda qolmagan` }, { status: 409 });
  }

  await prisma.requestResult.update({ where: { id: shown.id }, data: { reservedAt: new Date(), reservedSize: size } });
  const res: ReserveResponse = {
    code: `${requestId}`,
    name: shown.product.name,
    sku: shown.product.sku,
    color: shown.product.color,
    size,
    priceLabel: formatPrice(shown.product.price),
  };
  return Response.json(res);
}
