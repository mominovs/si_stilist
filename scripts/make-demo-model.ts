// Demo uchun sun'iy (SI yaratgan, real bo'lmagan) model suratini yaratadi: public/tryon-demo/model.jpg
// Real odam suratidan foydalanishga rozilik kerak emas. Keyin: npm run tryon:prepare -- public/tryon-demo/model.jpg
//   npm run tryon:model            -> erkak model
//   npm run tryon:model -- ayol    -> ayol model (model-ayol.jpg)

import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { config } from "../src/lib/config";

async function main() {
  const female = process.argv[2] === "ayol";
  if (!config.tryOn.geminiKey) {
    console.log(".env faylida GEMINI_API_KEY yo'q");
    process.exit(1);
  }
  const ai = new GoogleGenAI({ apiKey: config.tryOn.geminiKey });
  const who = female ? "a young adult woman" : "a young adult man";
  const t0 = Date.now();
  const res = await ai.models.generateContent({
    model: config.tryOn.geminiModel,
    contents: `Photorealistic full-body studio photo of ${who}, standing straight and facing the camera, arms relaxed slightly away from the body, wearing a plain fitted light gray t-shirt and simple dark trousers, plain light background, soft even lighting, whole body visible from head to shoes.`,
    config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4" } },
  });
  const data = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!data) throw new Error(`Rasm qaytmadi: ${res.candidates?.[0]?.finishReason}`);
  const dir = path.join(process.cwd(), "public", "tryon-demo");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, female ? "model-ayol.jpg" : "model.jpg");
  await writeFile(file, await sharp(Buffer.from(data, "base64")).jpeg({ quality: 88 }).toBuffer());
  console.log(`Tayyor (${Date.now() - t0} ms): ${path.relative(process.cwd(), file)}`);
}

main().catch((e) => {
  console.error("XATO:", e instanceof Error ? e.message : e);
  process.exit(1);
});
