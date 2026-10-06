import { readdir } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { demoSettings } from "@/lib/demo-settings";
import { describeLlmError, llmConfigured, llmUsage } from "@/lib/query/llm";
import { tryOnUsage } from "@/lib/tryon";

export type CheckStatus = "ok" | "warn" | "fail";

export type Check = {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  /** Nima qilish kerak (status ok bo'lmaganda) */
  hint?: string;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${ms / 1000} s ichida javob yo'q`)), ms)),
  ]);
}

async function checkDatabase(): Promise<Check> {
  try {
    const [products, inStock, requests] = await withTimeout(
      Promise.all([
        prisma.product.count(),
        prisma.product.count({ where: { variants: { some: { stock: { gt: 0 } } } } }),
        prisma.request.count(),
      ]),
      5000,
    );
    if (products === 0) {
      return { id: "db", title: "Baza", status: "fail", detail: "Tovarlar yo'q", hint: "npm run db:seed" };
    }
    return {
      id: "db",
      title: "Baza",
      status: "ok",
      detail: `${products} tovar (${inStock} tasi omborda bor), ${requests} so'rov logda`,
    };
  } catch (e) {
    return {
      id: "db",
      title: "Baza",
      status: "fail",
      detail: `Ulanib bo'lmadi: ${(e instanceof Error && e.message.split("\n")[0]) || "baza o'chiq"}`,
      hint: "npm run db:start (yoki npm run dev: baza avtomatik ishga tushadi)",
    };
  }
}

async function checkPhotos(): Promise<Check> {
  try {
    const products = await prisma.product.findMany({ select: { imageUrl: true } });
    const real = products.filter((p) => !p.imageUrl.toLowerCase().endsWith(".svg")).length;
    if (products.length === 0) return { id: "photos", title: "Tovar rasmlari", status: "warn", detail: "Tovar yo'q" };
    const detail = `${real}/${products.length} tovarda haqiqiy surat, qolganida chizma (SVG)`;
    if (real === products.length) return { id: "photos", title: "Tovar rasmlari", status: "ok", detail };
    return {
      id: "photos",
      title: "Tovar rasmlari",
      status: "warn",
      detail,
      hint: "Chizma bilan kiyintirish sifati past. Oq fondagi suratlar: public/products/<sku>.jpg, keyin npm run images:apply",
    };
  } catch {
    return { id: "photos", title: "Tovar rasmlari", status: "warn", detail: "Bazasiz tekshirib bo'lmadi" };
  }
}

async function checkLlm(): Promise<Check> {
  const base = { id: "llm", title: "SI (so'rovni tushunish)" };
  const usage = llmUsage();
  const usageText = `bugun ${usage.used}/${usage.limit} so'rov`;
  if (demoSettings.llmOff) {
    return {
      ...base,
      status: "warn",
      detail: "Qo'lda o'chirilgan: so'rovlar kalit so'zlar bo'yicha tushuniladi",
      hint: "Pastdagi \"Zaxira rejimlar\" bo'limidan qayta yoqing",
    };
  }
  if (!llmConfigured()) {
    return {
      ...base,
      status: "warn",
      detail: "API kalit yo'q: kalit so'z rejimi ishlaydi (sifati pastroq)",
      hint: ".env faylida ANTHROPIC_API_KEY",
    };
  }
  const t0 = Date.now();
  try {
    // Tekin so'rov: kalit va internetni tekshiradi, token sarflamaydi
    const client = new Anthropic({ apiKey: config.llm.apiKey, maxRetries: 0, timeout: 6000 });
    await client.models.list({ limit: 1 });
    return { ...base, status: "ok", detail: `Ulanish bor (${Date.now() - t0} ms), model ${config.llm.model}, ${usageText}` };
  } catch (e) {
    return {
      ...base,
      status: "warn",
      detail: `Ishlamayapti: ${describeLlmError(e)}. Zaxira: kalit so'z rejimi`,
      hint: "Internetni tekshiring yoki npm run check:ai",
    };
  }
}

async function checkTryOn(): Promise<Check> {
  const base = { id: "tryon", title: `Kiyintirish (${config.tryOn.providerLabel})` };
  if (demoSettings.tryOnDemo) {
    return {
      ...base,
      status: "warn",
      detail: "Qo'lda demo rejimga o'tkazilgan: tayyor natijalar ko'rsatiladi",
      hint: "Pastdagi \"Zaxira rejimlar\" bo'limidan qayta yoqing",
    };
  }
  if (config.tryOn.provider !== "local") {
    if (!config.tryOn.activeKey) {
      return { ...base, status: "fail", detail: "Kalit yo'q: har doim demo rejim", hint: "TRYON_PROVIDER=local yoki kalit" };
    }
    const usage = tryOnUsage();
    return {
      ...base,
      status: "warn",
      detail: `Kalit bor, lekin tekshirilmadi (har chaqiruv pullik). Bugun ${usage.used}/${usage.limit}`,
      hint: "npm run check:tryon -- surat.jpg",
    };
  }
  try {
    const res = await withTimeout(fetch(`${config.tryOn.localUrl}/health`, { cache: "no-store" }), 3000);
    const h = (await res.json()) as {
      status?: string;
      error?: string;
      mode?: string;
      preset?: string;
      resolution?: string;
      steps?: number;
      device?: string;
      version?: number;
    };
    const detail = `${h.mode ?? "?"} rejim, ${h.resolution ?? "?"}, ${h.steps ?? "?"} qadam, qurilma ${h.device ?? "?"}`;
    if (h.status === "loading") {
      return { ...base, status: "warn", detail: "Model yuklanmoqda", hint: "Server oynasida \"[model] tayyor\" yozuvini kuting" };
    }
    if (h.status !== "ready") {
      return { ...base, status: "fail", detail: `Model yuklanmadi: ${h.error ?? h.status}`, hint: "Server oynasidagi xatoni o'qing" };
    }
    if ((h.version ?? 0) < 4) {
      return { ...base, status: "warn", detail: `Eski server: ${detail}`, hint: "git pull, keyin tryon-local\\stop.bat va start.bat" };
    }
    if (h.device === "mock") {
      return { ...base, status: "warn", detail: `Sinov (mock) rejimi: ${detail}`, hint: "start.bat ni --mock siz ishga tushiring" };
    }
    return { ...base, status: "ok", detail };
  } catch {
    return {
      ...base,
      status: "fail",
      detail: `Lokal server javob bermayapti (${config.tryOn.localUrl}). Kiyintirish demo rejimda ishlaydi`,
      hint: "tryon-local\\start.bat",
    };
  }
}

async function checkDemoResults(): Promise<Check> {
  const base = { id: "demo", title: "Tayyor demo natijalari" };
  let files: string[] = [];
  try {
    files = await readdir(path.join(process.cwd(), "public", "tryon-demo"));
  } catch {
    // papka yo'q
  }
  const ready = new Set(files.filter((f) => /\.jpg$/i.test(f)).map((f) => f.replace(/\.jpg$/i, "").toUpperCase()));
  let skus: string[] = [];
  try {
    skus = (await prisma.product.findMany({ select: { sku: true } })).flatMap((p) => (p.sku ? [p.sku] : []));
  } catch {
    // baza ishlamasa ham fayllar soni ko'rsatiladi
  }
  const covered = skus.filter((s) => ready.has(s.toUpperCase())).length;
  const detail = skus.length ? `${covered}/${skus.length} tovar uchun tayyor natija bor` : `${ready.size} ta fayl`;
  if (covered > 0 || (!skus.length && ready.size > 0)) return { ...base, status: "ok", detail };
  return {
    ...base,
    status: "warn",
    detail: `${detail}: xizmat ishlamasa taxminiy ustma-ust ko'rinish chiqadi`,
    hint: "Demoda ko'rsatiladigan tovarlar uchun: npm run tryon:prepare -- model.jpg FT-06,KY-01",
  };
}

function checkAdminPassword(): Check {
  if (process.env.ADMIN_PASSWORD) {
    return { id: "auth", title: "Admin paroli", status: "ok", detail: "Panel va admin parol bilan himoyalangan" };
  }
  return {
    id: "auth",
    title: "Admin paroli",
    status: "warn",
    detail: "Parol yo'q: panel va admin hammaga ochiq (faqat dev rejimida)",
    hint: ".env faylida ADMIN_PASSWORD",
  };
}

/** Demo oldidan tekshiruv: /admin/holat va npm run check:demo */
export async function runChecks(): Promise<Check[]> {
  const [db, photos, llm, tryon, demo] = await Promise.all([
    checkDatabase(),
    checkPhotos(),
    checkLlm(),
    checkTryOn(),
    checkDemoResults(),
  ]);
  return [db, llm, tryon, demo, photos, checkAdminPassword()];
}
