// public/products/ ga qo'yilgan haqiqiy tovar suratlarini (<sku>.jpg/.png/.webp) bazaga ulaydi.
// Bazani qayta seed qilmaydi: faqat rasm manzillari yangilanadi, so'rovlar logi saqlanib qoladi.
//   npm run images:apply

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { imagePathFor, seedProducts } from "../prisma/seed-data/products";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  let photos = 0;
  for (const p of seedProducts) {
    const url = imagePathFor(p.sku);
    if (url.endsWith(".svg")) continue;
    const { count } = await prisma.product.updateMany({ where: { sku: p.sku }, data: { imageUrl: url } });
    if (count > 0) {
      photos++;
      console.log(`OK  ${p.sku} -> ${url}`);
    }
  }
  console.log(`\n${photos} ta tovarga haqiqiy surat ulandi, ${seedProducts.length - photos} tasida SVG qoldi.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
