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
