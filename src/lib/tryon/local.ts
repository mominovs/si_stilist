import { config } from "@/lib/config";
import type { TryOnCategory } from "./fal";

/** Lokal server javob bermadi yoki xato qaytardi */
export class LocalTryOnError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

/**
 * O'z kompyuterdagi CatVTON serveri (tryon-local/server.py). Surat shu kompyuterdan tashqariga chiqmaydi.
 */
export async function runLocalTryOn(input: {
  human: Buffer;
  garment: Buffer;
  category: TryOnCategory;
  signal: AbortSignal;
}): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${config.tryOn.localUrl}/tryon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        person: input.human.toString("base64"),
        garment: input.garment.toString("base64"),
        category: input.category,
      }),
      signal: input.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    throw new LocalTryOnError("lokal SI server ishlamayapti, tryon-local\\start.bat ni ishga tushiring", null);
  }
  const data = (await res.json().catch(() => ({}))) as { image?: string; detail?: string };
  if (!res.ok || !data.image) {
    throw new LocalTryOnError(data.detail ?? `lokal server xatosi (${res.status})`, res.status);
  }
  return `data:image/jpeg;base64,${data.image}`;
}

export type TryOnPreview = { image: string; step: number; total: number };

/**
 * Oqimli variant: server oraliq ko'rinishlarni (10/20/30-qadam) yuboradi, onPreview ular bilan chaqiriladi.
 * Yakuniy natija qaytariladi (data URI).
 */
export async function runLocalTryOnStream(
  input: { human: Buffer; garment: Buffer; category: TryOnCategory; signal: AbortSignal },
  onPreview: (p: TryOnPreview) => void,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${config.tryOn.localUrl}/tryon/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        person: input.human.toString("base64"),
        garment: input.garment.toString("base64"),
        category: input.category,
      }),
      signal: input.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    throw new LocalTryOnError("lokal SI server ishlamayapti, tryon-local\\start.bat ni ishga tushiring", null);
  }
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new LocalTryOnError(data.detail ?? `lokal server xatosi (${res.status})`, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const ev = JSON.parse(line) as
        | { type: "preview"; image: string; step: number; total: number }
        | { type: "result"; image: string }
        | { type: "error"; status: number; detail: string };
      if (ev.type === "preview") onPreview({ image: `data:image/jpeg;base64,${ev.image}`, step: ev.step, total: ev.total });
      else if (ev.type === "result") return `data:image/jpeg;base64,${ev.image}`;
      else throw new LocalTryOnError(ev.detail, ev.status);
    }
  }
  throw new LocalTryOnError("lokal server javobi to'liq kelmadi", null);
}
