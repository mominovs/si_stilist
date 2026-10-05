import { createFalClient } from "@fal-ai/client";
import { config } from "@/lib/config";

export type TryOnCategory = "tops" | "bottoms" | "one-pieces";

type TryOnInput = {
  human: Blob;
  garment: Blob;
  category: TryOnCategory;
  signal: AbortSignal;
};

// Endpoint konfiguratsiyada (TRYON_ENDPOINT). Har bir model kirish maydonlarini boshqacha nomlaydi,
// shuning uchun ikkita adapter: Kolors (standart) va FASHN.
function buildInput(endpoint: string, humanUrl: string, garmentUrl: string, category: TryOnCategory) {
  if (endpoint.includes("fashn")) {
    return {
      model_image: humanUrl,
      garment_image: garmentUrl,
      category,
      garment_photo_type: "flat-lay",
      output_format: "jpeg",
      sync_mode: true,
    };
  }
  // fal-ai/kling/v1-5/kolors-virtual-try-on
  return { human_image_url: humanUrl, garment_image_url: garmentUrl, sync_mode: true };
}

function extractImageUrl(data: unknown): string | null {
  const d = data as { image?: { url?: string }; images?: { url?: string }[] };
  return d?.image?.url ?? d?.images?.[0]?.url ?? null;
}

/** Haqiqiy try-on so'rovi. Natija rasmi URL (yoki sync_mode bo'lsa data URI) qaytariladi. */
export async function runFalTryOn({ human, garment, category, signal }: TryOnInput): Promise<string> {
  const fal = createFalClient({ credentials: config.tryOn.apiKey });
  const endpoint = config.tryOn.endpoint;

  // Xaridor surati fal CDN'ga 1 soatlik muddat bilan yuklanadi; bizning serverda saqlanmaydi
  const [humanUrl, garmentUrl] = await Promise.all([
    fal.storage.upload(human, { lifecycle: { expiresIn: "1h" } }),
    fal.storage.upload(garment, { lifecycle: { expiresIn: "1d" } }),
  ]);

  const result = await fal.subscribe(endpoint, {
    input: buildInput(endpoint, humanUrl, garmentUrl, category),
    abortSignal: signal,
  });
  const url = extractImageUrl(result.data);
  if (!url) throw new Error("Try-on javobida rasm yo'q");
  return url;
}
