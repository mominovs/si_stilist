import { config } from "@/lib/config";
import { garmentPng } from "./garment";

/**
 * Jonli oyna: kamera kadri lokal serverga (tryon-local, DM-VTON) yuboriladi, kiyintirilgan kadr qaytadi.
 * Kadrlar faqat xotirada: bazaga ham, diskka ham yozilmaydi.
 */

export type MirrorResult =
  | { ok: true; image: ArrayBuffer }
  | { ok: false; status: number; error: string };

// Lokal serverga allaqachon yuborilgan kiyimlar (server qayta ishga tushsa 404 qaytadi va qayta yuboriladi)
const uploaded = new Set<string>();

type MirrorProduct = { id: number; sku: string | null; imageUrl: string };

const garmentId = (p: MirrorProduct) => `${p.id}-${p.sku ?? ""}`;

async function uploadGarment(p: MirrorProduct): Promise<MirrorResult | null> {
  const res = await fetch(`${config.tryOn.localUrl}/mirror/garment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: garmentId(p), image: (await garmentPng(p.imageUrl)).toString("base64") }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { ok: false, status: res.status, error: await detail(res) };
  uploaded.add(garmentId(p));
  return null;
}

async function detail(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { detail?: string };
  return data.detail ?? `lokal server xatosi (${res.status})`;
}

export async function mirrorFrame(product: MirrorProduct, frame: Uint8Array): Promise<MirrorResult> {
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!uploaded.has(garmentId(product))) {
        const failed = await uploadGarment(product);
        if (failed) return failed;
      }
      const res = await fetch(`${config.tryOn.localUrl}/mirror?id=${encodeURIComponent(garmentId(product))}`, {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: frame as unknown as BodyInit,
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return { ok: true, image: await res.arrayBuffer() };
      if (res.status === 404 && attempt === 0) {
        uploaded.delete(garmentId(product)); // server qayta ishga tushgan: kiyim qayta yuboriladi
        continue;
      }
      return { ok: false, status: res.status, error: await detail(res) };
    }
    return { ok: false, status: 500, error: "kiyimni yuborib bo'lmadi" };
  } catch {
    return { ok: false, status: 503, error: "lokal SI server ishlamayapti (tryon-local\\start.bat)" };
  }
}
