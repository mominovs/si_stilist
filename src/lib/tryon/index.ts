import { access } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "@fal-ai/client";
import { ApiError as GeminiApiError } from "@google/genai";
import { config } from "@/lib/config";
import { demoSettings } from "@/lib/demo-settings";
import { garmentPng } from "./garment";
import { runFalTryOn, type TryOnCategory } from "./fal";
import { GeminiBlockedError, runGeminiTryOn } from "./gemini";
import { LocalTryOnError, runLocalTryOn, runLocalTryOnStream, type TryOnPreview } from "./local";

export type { TryOnPreview } from "./local";

export type TryOnResult =
  | { mode: "api"; image: string }
  /** Surat yaroqsiz (odam topilmadi, juda yaqin...): xaridor qayta suratga tushadi, demo ko'rsatilmaydi */
  | { mode: "photo"; message: string }
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

/** Bugungi pullik kiyintirishlar soni (holat sahifasi uchun) */
export function tryOnUsage(): { used: number; limit: number } {
  const day = new Date().toISOString().slice(0, 10);
  return { used: quota.day === day ? quota.used : 0, limit: config.tryOn.dailyLimit };
}

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
  if (e instanceof LocalTryOnError) {
    if (e.status === 503) return "lokal model hali yuklanmoqda, bir daqiqadan keyin urinib ko'ring";
    return e.message;
  }
  if (e instanceof GeminiBlockedError) return "xizmat bu suratni qayta ishlashni rad etdi, boshqa surat bilan urinib ko'ring";
  if (e instanceof GeminiApiError) {
    if (e.status === 400 && /api key/i.test(e.message)) return "kalit noto'g'ri";
    if (e.status === 401 || e.status === 403) return "kalit noto'g'ri yoki ruxsat yo'q";
    if (e.status === 429) {
      return /limit: 0\b/.test(e.message)
        ? "bu kalitda rasm modeli uchun bepul limit yo'q, Google AI Studio'da billing ulash kerak"
        : "so'rovlar limiti tugadi, birozdan keyin urinib ko'ring";
    }
    if (e.status >= 500) return "xizmat band, birozdan keyin urinib ko'ring";
    return `xizmat xatosi (${e.status})`;
  }
  if (e instanceof ApiError) {
    if (e.status === 401 || e.status === 403) return "kalit noto'g'ri yoki ruxsat yo'q";
    if (e.status === 402) return "hisobda mablag' yetarli emas";
    if (e.status === 422) return "surat yaroqsiz (odam to'liq ko'rinmayapti)";
    if (e.status === 429) return "xizmat band, birozdan keyin urinib ko'ring";
    return `xizmat xatosi (${e.status})`;
  }
  return "xizmat bilan aloqa yo'q";
}

/** Tanlangan provayder (Gemini yoki fal) orqali bitta kiyintirish. Natija: rasm URL yoki data URI */
export async function runProviderTryOn(input: {
  photo: Buffer;
  photoType: string;
  garment: Buffer;
  category: TryOnCategory;
  signal: AbortSignal;
  /** Faqat lokal provayder oraliq ko'rinishlarni bera oladi */
  onPreview?: (p: TryOnPreview) => void;
}): Promise<string> {
  const { photo, photoType, garment, category, signal, onPreview } = input;
  if (config.tryOn.provider === "local") {
    return onPreview
      ? runLocalTryOnStream({ human: photo, garment, category, signal }, onPreview)
      : runLocalTryOn({ human: photo, garment, category, signal });
  }
  if (config.tryOn.provider === "gemini") {
    return runGeminiTryOn({ human: photo, humanType: photoType, garment, category, signal });
  }
  return runFalTryOn({
    human: new Blob([new Uint8Array(photo)], { type: photoType }),
    garment: new Blob([new Uint8Array(garment)], { type: "image/png" }),
    category,
    signal,
  });
}

async function demo(product: TryOnProduct, reason: string): Promise<TryOnResult> {
  return { mode: "demo", reason, prepared: await preparedImage(product.sku) };
}

/**
 * Virtual kiyintirish. Xaridor surati faqat xotirada turadi va try-on xizmatiga yuboriladi:
 * bazaga ham, diskka ham yozilmaydi. Har qanday muammoda "demo rejim" natijasi qaytariladi.
 */
export async function tryOn(
  product: TryOnProduct,
  photo: Buffer,
  photoType: string,
  onPreview?: (p: TryOnPreview) => void,
): Promise<TryOnResult> {
  if (demoSettings.tryOnDemo) return demo(product, "demo rejim qo'lda yoqilgan");
  if (!config.tryOn.activeKey) return demo(product, "virtual kiyintirish kaliti sozlanmagan");
  if (config.tryOn.isPaid && !takeQuota()) return demo(product, "kunlik kiyintirish limiti tugadi");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.tryOn.timeoutMs);
  const t0 = Date.now();
  try {
    const image = await runProviderTryOn({
      photo,
      photoType,
      garment: await garmentPng(product.imageUrl),
      category: tryOnCategory(product.category),
      signal: ctrl.signal,
      onPreview,
    });
    console.log(`[tryon] ${config.tryOn.provider} tayyor (${Date.now() - t0} ms)`);
    return { mode: "api", image };
  } catch (e) {
    if (e instanceof LocalTryOnError && e.status === 422) return { mode: "photo", message: e.message };
    const reason = ctrl.signal.aborted ? "xizmat juda sekin javob berdi" : describeError(e);
    console.warn(`[tryon] demo rejimga o'tildi (${reason}):`, e instanceof Error ? e.message : e);
    return demo(product, reason);
  } finally {
    clearTimeout(timer);
  }
}
