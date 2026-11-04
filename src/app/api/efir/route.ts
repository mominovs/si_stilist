import { config } from "@/lib/config";
import { createRoom } from "@/lib/efir";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/** Yangi jonli efir xonasi: {code}. Xona faqat xotirada, 30 daqiqa harakatsizlikdan keyin o'chadi */
export async function POST(request: Request) {
  if (!config.efir.enabled) return Response.json({ error: "Jonli efir hozircha o'chirilgan" }, { status: 404 });
  if (!rateLimit(`efir-new:${clientKey(request)}`, 10).ok) {
    return Response.json({ error: "Juda ko'p xona ochildi, birozdan keyin urinib ko'ring" }, { status: 429 });
  }
  return Response.json({ code: createRoom() });
}
