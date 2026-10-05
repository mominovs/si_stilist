import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { tryOn } from "@/lib/tryon";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const bodySchema = z.object({
  productId: z.number().int().positive(),
  // Brauzer suratni kichraytirib, data URL ko'rinishida yuboradi
  photo: z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Surat formati noto'g'ri"),
});

export async function POST(request: Request) {
  // Har bir kiyintirish pullik: bitta qurilmadan daqiqasiga ko'pi bilan 6 ta
  const limited = rateLimit(`tryon:${clientKey(request)}`, 6);
  if (!limited.ok) {
    return Response.json({ error: `Juda tez-tez. ${limited.retryAfterSec} soniyadan keyin urinib ko'ring.` }, { status: 429 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "So'rov noto'g'ri" }, { status: 400 });

  const [, type, base64] = body.data.photo.match(/^data:(image\/\w+);base64,(.+)$/) ?? [];
  const photo = Buffer.from(base64, "base64");
  if (photo.length === 0 || photo.length > MAX_PHOTO_BYTES) {
    return Response.json({ error: "Surat hajmi 5 MB dan oshmasin" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id: body.data.productId },
    select: { sku: true, category: true, imageUrl: true },
  });
  if (!product) return Response.json({ error: "Tovar topilmadi" }, { status: 404 });

  // Surat faqat shu so'rov davomida xotirada: hech qayerga yozilmaydi
  return Response.json(await tryOn(product, photo, type));
}
