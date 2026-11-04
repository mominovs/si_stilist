import { supportsMirror } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { publishFrame, validCode } from "@/lib/efir";
import { mirrorFrame } from "@/lib/tryon/mirror";

const MAX_FRAME_BYTES = 1024 * 1024;

// Jonli oyna bir vaqtda ko'pi bilan MIRROR_MAX_SESSIONS (standart 6) xaridorga. Lokal server ularning kadrlarini
// GPU'da to'plab ishlaydi, kadr tezligi esa hammaga teng bo'linadi (har biri o'z javobini kutib keyingisini
// yuboradi). Sig'imni tryon-local/yuk_sinovi.py bilan o'lchab sozlang. Ortig'iga 409: sahifa navbatda kutib qayta
// urinadi. Seans shuncha vaqt kadr yubormasa (yopilgan) o'rni bo'shaydi. Lokal server har seansni alohida saqlaydi (?s=)
const MAX_SESSIONS = Math.max(1, Math.min(32, Number(process.env.MIRROR_MAX_SESSIONS) || 6));
const SESSION_IDLE_MS = 4000;
const activeSessions = new Map<string, number>();

/** true: shu seans oynani ishlatishi mumkin; false: allaqachon MAX_SESSIONS kishi ishlatmoqda */
function claimMirror(id: string): boolean {
  const now = Date.now();
  for (const [sid, at] of activeSessions) if (now - at >= SESSION_IDLE_MS) activeSessions.delete(sid);
  if (!activeSessions.has(id) && activeSessions.size >= MAX_SESSIONS) return false;
  activeSessions.set(id, now);
  return true;
}

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
  const session = (request.headers.get("x-mirror-session") ?? "").slice(0, 64) || clientKey(request);
  if (!claimMirror(session)) {
    return Response.json(
      { error: `Jonli oyna hozir band (${MAX_SESSIONS} kishi ishlatmoqda): navbatda kutilmoqda, o'zi ulanadi...` },
      { status: 409 },
    );
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

  const result = await mirrorFrame(product, frame, session);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  // Jonli efirda: kiyintirilgan kadr xonadagi sherikka ham ko'rinadi (faqat oxirgi kadr, xotirada)
  const room = request.headers.get("x-efir-room") ?? "";
  const pid = request.headers.get("x-efir-pid") ?? "";
  if (room && pid && validCode(room)) publishFrame(room, pid, new Uint8Array(result.image), product.id);
  return new Response(result.image, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store",
      "X-Mirror-Ms": result.serverMs ?? "",
      "X-Mirror-Body": result.body ?? "",
    },
  });
}
