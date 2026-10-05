// Demo rejim uchun oldindan tayyorlangan kiyintirish natijalarini yaratadi.
// Bitta model surati (rozilik olingan odam yoki stok rasm) barcha tovarlarga kiyintiriladi va
// public/tryon-demo/<sku>.jpg ga saqlanadi. Internet yoki API ishlamay qolsa, xaridor ekrani shu rasmlarni
// "Demo rejim" belgisi bilan ko'rsatadi.
//
//   npm run tryon:prepare -- model.jpg                 -> barcha tovarlar (48 ta, har biri pullik bo'lishi mumkin)
//   npm run tryon:prepare -- model.jpg KY-01,LB-01     -> faqat ko'rsatilgan SKU'lar

import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { garmentPng } from "../src/lib/tryon/garment";
import { runProviderTryOn, tryOnCategory } from "../src/lib/tryon";
import { imagePathFor, seedProducts } from "../prisma/seed-data/products";

async function main() {
  const [modelPath, only] = process.argv.slice(2);
  if (!modelPath) {
    console.log("Foydalanish: npm run tryon:prepare -- model.jpg [SKU1,SKU2]");
    process.exit(1);
  }
  const model = await readFile(modelPath);
  const type = modelPath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  const skus = only ? new Set(only.split(",").map((s) => s.trim().toUpperCase())) : null;
  const outDir = path.join(process.cwd(), "public", "tryon-demo");
  await mkdir(outDir, { recursive: true });

  for (const p of seedProducts.filter((x) => !skus || skus.has(x.sku))) {
    const t0 = Date.now();
    try {
      const url = await runProviderTryOn({
        photo: model,
        photoType: type,
        garment: await garmentPng(imagePathFor(p.sku)),
        category: tryOnCategory(p.category),
        signal: AbortSignal.timeout(120_000),
      });
      const res = await fetch(url);
      await writeFile(path.join(outDir, `${p.sku.toLowerCase()}.jpg`), Buffer.from(await res.arrayBuffer()));
      console.log(`OK   ${p.sku} (${Date.now() - t0} ms)`);
    } catch (e) {
      console.log(`XATO ${p.sku}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

main();
