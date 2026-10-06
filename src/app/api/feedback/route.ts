import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  requestId: z.number().int().positive(),
  value: z.enum(["mos", "mos-emas"]),
});

/** Xaridor bahosi: topilgan tovarlar mos keldimi. Faqat so'nggi 2 soatdagi so'rovni baholash mumkin */
export async function POST(request: Request) {
  if (!rateLimit(`feedback:${clientKey(request)}`, 30).ok) {
    return Response.json({ error: "Juda tez-tez" }, { status: 429 });
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "So'rov noto'g'ri" }, { status: 400 });

  const { count } = await prisma.request.updateMany({
    where: { id: body.data.requestId, createdAt: { gte: new Date(Date.now() - 2 * 3600_000) }, resultCount: { gt: 0 } },
    data: { feedback: body.data.value },
  });
  if (count === 0) return Response.json({ error: "So'rov topilmadi" }, { status: 404 });
  return Response.json({ ok: true });
}
