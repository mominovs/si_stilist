import { supportsMirror } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { mirrorFrame } from "@/lib/tryon/mirror";

const MAX_FRAME_BYTES = 1024 * 1024;

// Har kadrda bazaga murojaat qilinmasin (kadrlar sekundiga o'nlab keladi): tovar 1 daqiqa xotirada turadi
const productCache = new Map<number, { at: number; product: Awaited<ReturnType<typeof queryProduct>> }>();

function queryProduct(id: number) {
  return prisma.product.findUnique({ where: { id }, select: { id: true, sku: true, imageUrl: true, category: true } });
}

async function loadProduct(id: number) {
  const hit = productCache.get(id);
  if (hit && Date.now() - hit.at < 60_000) return hit.product;
  const product = await queryProduct(id);
  productCache.set(id, { at: Date.now(), product });
  return product;
}

/**
 * Jonli oyna kadri: so'rov tanasi JPEG (kamera kadri), javob JPEG (kiyintirilgan kadr).
 * Xato: JSON {error}, status 422 (kadrda odam yo'q), 503 (oyna ishlamayapti).
 */
export async function POST(request: Request) {
  // Kadrlar ketma-ket keladi (~10-25/s): cheklov faqat suiiste'molga qarshi
  if (!rateLimit(`mirror:${clientKey(request)}`, 2400).ok) {
    return Response.json({ error: "Juda tez-tez" }, { status: 429 });
  }
  const productId = Number(new URL(request.url).searchParams.get("productId"));
  if (!Number.isInteger(productId) || productId <= 0) return Response.json({ error: "Tovar ko'rsatilmagan" }, { status: 400 });

  const frame = new Uint8Array(await request.arrayBuffer());
  if (frame.length === 0 || frame.length > MAX_FRAME_BYTES) {
    return Response.json({ error: "Kadr hajmi noto'g'ri" }, { status: 400 });
  }

  const product = await loadProduct(productId);
  if (!product) return Response.json({ error: "Tovar topilmadi" }, { status: 404 });
  if (!supportsMirror(product.category)) {
    return Response.json({ error: "Jonli oyna faqat ustki kiyim uchun" }, { status: 400 });
  }

  const result = await mirrorFrame(product, frame);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return new Response(result.image, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store", "X-Mirror-Ms": result.serverMs ?? "" },
  });
}
