import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { matchProducts } from "../src/lib/matching";
import { EMPTY_QUERY, type ParsedQuery } from "../src/lib/query/schema";
import { imagePathFor, seedProducts, sizesFor, stockFor } from "./seed-data/products";
import { minutesAgoFor, requestTemplates } from "./seed-data/requests";

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
  const history = await seedRequestHistory();
  console.log(`Seed tayyor: ${products} ta tovar, ${inStock} ta o'lcham omborda bor, ${history} ta namunaviy so'rov.`);
}

async function seedRequestHistory(): Promise<number> {
  const products = await prisma.product.findMany({ include: { variants: true } });
  const now = Date.now();
  let i = 0;
  for (const t of requestTemplates) {
    for (let k = 0; k < t.weight; k++) {
      const text = t.texts[k % t.texts.length];
      const parsed: ParsedQuery = {
        ...EMPTY_QUERY,
        ...t.parsed,
        olcham: t.sizes ? t.sizes[k % t.sizes.length] : null,
        izoh: text,
      };
      const { results, status } = matchProducts(products, parsed);
      await prisma.request.create({
        data: {
          createdAt: new Date(now - minutesAgoFor(i++) * 60_000),
          rawText: text,
          parsed,
          mode: "namuna",
          resultCount: results.length,
          status,
          results: {
            create: results.map((r, rank) => ({ productId: r.product.id, rank: rank + 1, isExact: r.isExact })),
          },
        },
      });
    }
  }
  return i;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
