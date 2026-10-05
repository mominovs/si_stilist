// Virtual kiyintirish (fal.ai) kalitini tekshirish.
//   npm run check:tryon                 -> kalit va hisobni tekshiradi (surat sifatida kiyim rasmi ketadi)
//   npm run check:tryon -- men.jpg      -> haqiqiy surat bilan to'liq sinov, natija tryon-test.jpg ga yoziladi
// Diqqat: muvaffaqiyatli so'rov pullik (~$0.07).

import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { config } from "../src/lib/config";
import { garmentPng } from "../src/lib/tryon/garment";
import { runFalTryOn } from "../src/lib/tryon/fal";
import { ApiError } from "@fal-ai/client";

async function main() {
  const key = config.tryOn.apiKey;
  console.log("1) Sozlamalar");
  if (!key) {
    console.log("  .env faylida FAL_KEY topilmadi.");
    process.exit(1);
  }
  console.log(`  kalit: ${key.slice(0, 8)}...${key.slice(-4)}`);
  console.log(`  endpoint: ${config.tryOn.endpoint}`);

  const photoPath = process.argv[2];
  const garment = await garmentPng("/products/ky-01.svg");
  const human = photoPath ? await readFile(photoPath) : garment;
  const type = photoPath?.toLowerCase().endsWith(".png") ? "image/png" : photoPath ? "image/jpeg" : "image/png";

  console.log(`\n2) So'rov (${photoPath ? `surat: ${photoPath}` : "suratsiz, faqat kalit tekshiruvi"})`);
  const t0 = Date.now();
  try {
    const url = await runFalTryOn({
      human: new Blob([new Uint8Array(human)], { type }),
      garment: new Blob([new Uint8Array(garment)], { type: "image/png" }),
      category: "tops",
      signal: AbortSignal.timeout(90_000),
    });
    console.log(`  OK: ${Date.now() - t0} ms`);
    const res = await fetch(url);
    await writeFile("tryon-test.jpg", Buffer.from(await res.arrayBuffer()));
    console.log("  natija saqlandi: tryon-test.jpg");
  } catch (e) {
    console.log(`  XATO: ${Date.now() - t0} ms`);
    if (e instanceof ApiError) {
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
