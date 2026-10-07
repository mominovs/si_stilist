import { z } from "zod";
import { adminGuard } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  resultId: z.number().int().positive(),
  size: z.string().regex(/^[A-Z0-9]{1,5}$/).nullable(),
});

/**
 * Sotuvchi belgilaydi: xaridor kiyib ko'rgach qaysi o'lcham haqiqatda to'g'ri keldi. Jonli oyna tavsiyasining
 * aniqligi (sinov natijasi) shundan hisoblanadi. null: belgini olib tashlash.
 */
export async function POST(request: Request) {
  const denied = adminGuard(request);
  if (denied) return denied;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "So'rov noto'g'ri" }, { status: 400 });
  const { resultId, size } = body.data;

  const result = await prisma.requestResult.findUnique({
    where: { id: resultId },
    include: { product: { select: { variants: { select: { size: true } } } } },
  });
  if (!result?.recommendedSize) return Response.json({ error: "Bu tovarda o'lcham tavsiyasi yo'q" }, { status: 404 });
  if (size && !result.product.variants.some((v) => v.size === size)) {
    return Response.json({ error: "Bu tovarda bunday o'lcham yo'q" }, { status: 400 });
  }
  await prisma.requestResult.update({ where: { id: resultId }, data: { fittedSize: size } });
  return Response.json({ ok: true });
}
