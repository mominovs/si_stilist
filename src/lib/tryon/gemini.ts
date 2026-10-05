import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { config } from "@/lib/config";
import type { TryOnCategory } from "./fal";

const WHERE: Record<TryOnCategory, string> = {
  tops: "as their top (replace only the upper-body clothing)",
  bottoms: "as their bottoms (replace only the lower-body clothing: trousers or skirt)",
  "one-pieces": "as a full outfit (replace the clothing with this one-piece garment)",
};

function prompt(category: TryOnCategory): string {
  return [
    "Image 1 is a photo of a person. Image 2 is a product photo of a garment on a white background.",
    `Edit image 1 so that the same person is wearing the garment from image 2 ${WHERE[category]}.`,
    "Keep the person's face, identity, hair, skin tone, body shape, pose, background and lighting exactly the same.",
    "Reproduce the garment's color, cut, pattern and details faithfully, with natural fit and fabric folds.",
    "Do not add text, logos or other people. Return only the edited photo.",
  ].join(" ");
}

const RATIOS = ["1:1", "3:4", "4:3", "2:3", "3:2", "4:5", "5:4", "9:16", "16:9"];

/** Natija kadri xaridor suratining nisbatiga eng yaqin qo'llab-quvvatlanadigan nisbatda bo'lsin */
async function closestRatio(photo: Buffer): Promise<string> {
  const { width = 3, height = 4 } = await sharp(photo).metadata();
  const target = width / height;
  return RATIOS.reduce((best, r) => {
    const [a, b] = r.split(":").map(Number);
    const [ba, bb] = best.split(":").map(Number);
    return Math.abs(a / b - target) < Math.abs(ba / bb - target) ? r : best;
  });
}

export class GeminiBlockedError extends Error {}

/** Gemini rasm modeli bilan kiyintirish. Natija data URI ko'rinishida qaytadi (hech qayerda saqlanmaydi). */
export async function runGeminiTryOn(input: {
  human: Buffer;
  humanType: string;
  garment: Buffer;
  category: TryOnCategory;
  signal: AbortSignal;
}): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: config.tryOn.geminiKey });
  const response = await ai.models.generateContent({
    model: config.tryOn.geminiModel,
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt(input.category) },
          { inlineData: { mimeType: input.humanType, data: input.human.toString("base64") } },
          { inlineData: { mimeType: "image/png", data: input.garment.toString("base64") } },
        ],
      },
    ],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: await closestRatio(input.human) },
      abortSignal: input.signal,
    },
  });

  const candidate = response.candidates?.[0];
  const image = candidate?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!image?.data) {
    const reason = candidate?.finishReason ?? response.promptFeedback?.blockReason ?? "noma'lum";
    throw new GeminiBlockedError(`Gemini rasm qaytarmadi (${reason})`);
  }
  return `data:${image.mimeType ?? "image/png"};base64,${image.data}`;
}
