import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { imagePathFor, seedProducts, sizesFor, stockFor } from "./seed-data/products";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  // Demo uchun toza holat: so'rovlar logi ham tozalanadi
  await prisma.requestResult.deleteMany();
  await prisma.request.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();

  for (const p of seedProducts) {
    await prisma.product.create({
      data: {
        sku: p.sku,
        name: p.name,
        category: p.category,
        gender: p.gender,
        color: p.color,
        styleTags: p.styleTags,
        season: p.season,
        price: p.price,
        imageUrl: imagePathFor(p.sku),
        description: p.description ?? null,
        variants: {
          create: sizesFor(p).map((size) => ({
            size,
            stock: p.soldOut ? 0 : stockFor(p.sku, size),
          })),
        },
      },
    });
  }

  const [products, inStock] = await Promise.all([
    prisma.product.count(),
    prisma.productVariant.count({ where: { stock: { gt: 0 } } }),
  ]);
  console.log(`Seed tayyor: ${products} ta tovar, ${inStock} ta o'lcham omborda bor.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
