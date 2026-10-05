// Virtual kiyintirish kalitini tekshirish (tanlangan provayder: Gemini yoki fal.ai).
//   npm run check:tryon                 -> kalit va hisobni tekshiradi (surat sifatida kiyim rasmi ketadi)
//   npm run check:tryon -- men.jpg      -> haqiqiy surat bilan to'liq sinov, natija tryon-test.jpg ga yoziladi
// Diqqat: muvaffaqiyatli so'rov pullik bo'lishi mumkin (Gemini ~$0.04-0.07, fal ~$0.07).

import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { config } from "../src/lib/config";
import { garmentPng } from "../src/lib/tryon/garment";
import { runProviderTryOn } from "../src/lib/tryon";
import { ApiError } from "@fal-ai/client";
import { ApiError as GeminiApiError } from "@google/genai";

async function main() {
  const key = config.tryOn.activeKey;
  const provider = config.tryOn.provider;
  console.log("1) Sozlamalar");
  console.log(`  provayder: ${config.tryOn.providerLabel}`);
  if (provider === "local") {
    console.log(`  server: ${config.tryOn.localUrl}`);
    try {
      const health = await (await fetch(`${config.tryOn.localUrl}/health`)).json();
      console.log(`  holat: ${JSON.stringify(health)}`);
      if (!health.stream) {
        console.log("  -> Lokal server eski versiyada. Server oynasini yopib, tryon-local\\start.bat ni qayta ishga tushiring.");
      } else if ((health.version ?? 0) < 3) {
        console.log("  -> Niqobli rejim yo'q (eski server). git pull, setup.bat, stop.bat, keyin start.bat.");
      } else if (health.mode === "maskfree") {
        console.log("  -> Niqobsiz rejim: yaqin portret va murakkab pozalarda yuz/qo'llar buzilishi mumkin.");
      }
      if (health.status !== "ready") {
        console.log("  -> Model hali tayyor emas (yuklanmoqda yoki xato). Server oynasidagi yozuvlarga qarang.");
        process.exit(1);
      }
    } catch {
      console.log("  -> Lokal server ishlamayapti. tryon-local\\start.bat ni ishga tushiring.");
      process.exit(1);
    }
  } else {
    if (!key) {
      console.log(`  .env faylida ${provider === "gemini" ? "GEMINI_API_KEY" : "FAL_KEY"} topilmadi.`);
      process.exit(1);
    }
    console.log(`  kalit: ${key.slice(0, 8)}...${key.slice(-4)}`);
    console.log(`  model: ${provider === "gemini" ? config.tryOn.geminiModel : config.tryOn.endpoint}`);
  }

  const photoPath = process.argv[2];
  const garment = await garmentPng("/products/ky-01.svg");
  const human = photoPath ? await readFile(photoPath) : garment;
  const type = photoPath?.toLowerCase().endsWith(".png") ? "image/png" : photoPath ? "image/jpeg" : "image/png";

  console.log(`\n2) So'rov (${photoPath ? `surat: ${photoPath}` : "suratsiz, faqat kalit tekshiruvi"})`);
  const t0 = Date.now();
  try {
    const url = await runProviderTryOn({
      photo: human,
      photoType: type,
      garment,
      category: "tops",
      signal: AbortSignal.timeout(90_000),
    });
    console.log(`  OK: ${Date.now() - t0} ms`);
    const res = await fetch(url);
    await writeFile("tryon-test.jpg", Buffer.from(await res.arrayBuffer()));
    console.log("  natija saqlandi: tryon-test.jpg");
  } catch (e) {
    console.log(`  XATO: ${Date.now() - t0} ms`);
    if (e instanceof GeminiApiError) {
      console.log(`  status ${e.status}: ${e.message.slice(0, 300)}`);
      if (e.status === 429) console.log("  -> Limit tugadi yoki bu modelda bepul limit yo'q (aistudio.google.com da billing).");
    } else if (e instanceof ApiError) {
      console.log(`  status ${e.status}: ${String(JSON.stringify(e.body ?? e.message)).slice(0, 300)}`);
      if (e.status === 401 || e.status === 403) console.log("  -> Kalit noto'g'ri, hisobda mablag' yo'q (fal.ai/dashboard/billing) yoki tarmoq fal.ai'ni bloklagan.");
      if (e.status === 402) console.log("  -> Hisobda mablag' yetarli emas. fal.ai/dashboard/billing da to'ldiring.");
      if (e.status === 422 && !photoPath) console.log("  -> Kalit ishlayapti (surat sifatida kiyim rasmi yuborilgani uchun 422). Haqiqiy surat bilan sinang.");
    } else {
      console.log(`  ${e instanceof Error ? e.message : e}`);
    }
  }
}

main();
