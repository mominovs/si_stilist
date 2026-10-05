import { access } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "@fal-ai/client";
import { config } from "@/lib/config";
import { garmentPng } from "./garment";
import { runFalTryOn, type TryOnCategory } from "./fal";

export type TryOnResult =
  | { mode: "api"; image: string }
  | {
      mode: "demo";
      reason: string;
      /** Oldindan tayyorlangan natija (public/tryon-demo/<sku>.jpg), bo'lsa */
      prepared: string | null;
    };

type TryOnProduct = { sku: string | null; category: string; imageUrl: string };

const CATEGORY: Record<string, TryOnCategory> = {
  shim: "bottoms",
  yubka: "bottoms",
  libos: "one-pieces",
};

export const tryOnCategory = (category: string): TryOnCategory => CATEGORY[category] ?? "tops";

let quota = { day: "", used: 0 };

function takeQuota(): boolean {
  const day = new Date().toISOString().slice(0, 10);
  if (quota.day !== day) quota = { day, used: 0 };
  if (quota.used >= config.tryOn.dailyLimit) return false;
  quota.used++;
  return true;
}

async function preparedImage(sku: string | null): Promise<string | null> {
  if (!sku) return null;
  const name = `${sku.toLowerCase()}.jpg`;
  try {
    await access(path.join(process.cwd(), "public", "tryon-demo", name));
    return `/tryon-demo/${name}`;
  } catch {
    return null;
  }
}

function describeError(e: unknown): string {
  if (e instanceof Error && e.name === "AbortError") return "xizmat juda sekin javob berdi";
  if (e instanceof ApiError) {
    if (e.status === 401 || e.status === 403) return "kalit noto'g'ri yoki ruxsat yo'q";
    if (e.status === 402) return "hisobda mablag' yetarli emas";
    if (e.status === 422) return "surat yaroqsiz (odam to'liq ko'rinmayapti)";
    if (e.status === 429) return "xizmat band, birozdan keyin urinib ko'ring";
    return `xizmat xatosi (${e.status})`;
  }
  return "xizmat bilan aloqa yo'q";
}

async function demo(product: TryOnProduct, reason: string): Promise<TryOnResult> {
  return { mode: "demo", reason, prepared: await preparedImage(product.sku) };
}

/**
 * Virtual kiyintirish. Xaridor surati faqat xotirada turadi va try-on xizmatiga yuboriladi:
 * bazaga ham, diskka ham yozilmaydi. Har qanday muammoda "demo rejim" natijasi qaytariladi.
 */
export async function tryOn(product: TryOnProduct, photo: Buffer, photoType: string): Promise<TryOnResult> {
  if (!config.tryOn.apiKey) return demo(product, "virtual kiyintirish kaliti sozlanmagan");
  if (!takeQuota()) return demo(product, "kunlik kiyintirish limiti tugadi");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.tryOn.timeoutMs);
  const t0 = Date.now();
  try {
    const garment = await garmentPng(product.imageUrl);
    const image = await runFalTryOn({
      human: new Blob([new Uint8Array(photo)], { type: photoType }),
      garment: new Blob([new Uint8Array(garment)], { type: "image/png" }),
      category: tryOnCategory(product.category),
      signal: ctrl.signal,
    });
    console.log(`[tryon] tayyor (${Date.now() - t0} ms)`);
    return { mode: "api", image };
  } catch (e) {
    const reason = ctrl.signal.aborted ? "xizmat juda sekin javob berdi" : describeError(e);
    console.warn(`[tryon] demo rejimga o'tildi (${reason}):`, e instanceof Error ? e.message : e);
    return demo(product, reason);
  } finally {
    clearTimeout(timer);
  }
}
