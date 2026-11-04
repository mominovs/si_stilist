import { z } from "zod";

// Telefonda model sinovi natijalari (/oyna/sinov): qaysi telefon qaysi rejimda (WebGPU yoki WASM) necha ms.
// Faqat jarayon xotirasida (server qayta ishga tushsa tozalanadi): bu 2-bosqich o'lchovi uchun, shaxsiy
// ma'lumot yo'q (telefon modeli brauzer qatoridan, rasm yoki manzil saqlanmaydi).

export const benchResultSchema = z.object({
  model: z.string().regex(/^[a-z0-9_-]{1,32}$/),
  file: z.enum(["fp32", "fp16"]),
  backend: z.enum(["webgpu", "wasm"]),
  threads: z.number().int().min(1).max(64),
  downloadMs: z.number().min(0).max(600_000),
  initMs: z.number().min(0).max(600_000),
  firstMs: z.number().min(0).max(600_000),
  avgMs: z.number().min(0).max(600_000),
  p50Ms: z.number().min(0).max(600_000),
  runs: z.number().int().min(1).max(1000),
  diff: z.number().min(0).max(255).nullable(),
  gpu: z.string().max(120).nullable(),
  device: z.string().max(200),
});

export type BenchInput = z.infer<typeof benchResultSchema>;
export type BenchResult = BenchInput & { id: number; at: number; fps: number };

const MAX = 200;
const store = globalThis as unknown as { __mirrorBench?: { list: BenchResult[]; next: number } };

function state() {
  store.__mirrorBench ??= { list: [], next: 1 };
  return store.__mirrorBench;
}

export function addBenchResult(input: BenchInput, now = Date.now()): BenchResult {
  const s = state();
  const result: BenchResult = { ...input, id: s.next++, at: now, fps: input.avgMs > 0 ? 1000 / input.avgMs : 0 };
  s.list.unshift(result);
  if (s.list.length > MAX) s.list.length = MAX;
  return result;
}

export function listBenchResults(): BenchResult[] {
  return state().list;
}

export function clearBenchResults(): void {
  state().list = [];
}

/** Brauzer qatoridan qisqa telefon nomi: "Android 14; SM-A546E" yoki "iPhone; iOS 18_1" */
export function shortDevice(ua: string): string {
  const android = /Android [\d.]+;(?: [^;)]*;)*? ?([^;)]+?)(?: Build[^;)]*)?\)/.exec(ua);
  if (android) {
    const version = /Android [\d.]+/.exec(ua)?.[0] ?? "Android";
    const model = android[1].trim();
    return model && model !== "K" ? `${version}; ${model}` : version;
  }
  const ios = /(iPhone|iPad).*?OS ([\d_]+)/.exec(ua);
  if (ios) return `${ios[1]}; iOS ${ios[2].replace(/_/g, ".")}`;
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Linux/.test(ua)) return "Linux";
  return ua.slice(0, 60);
}
