import { test } from "node:test";
import assert from "node:assert/strict";
import { matchProducts, priceTiers, type MatchProduct } from "./matching";
import { EMPTY_QUERY, type ParsedQuery } from "./query/schema";
import { imagePathFor, seedProducts, sizesFor, stockFor } from "../../prisma/seed-data/products";

// Seed ombori bilan haqiqiy holatga yaqin test
const products: (MatchProduct & { sku: string })[] = seedProducts.map((p, i) => ({
  id: i + 1,
  sku: p.sku,
  category: p.category,
  gender: p.gender,
  color: p.color,
  styleTags: p.styleTags,
  season: p.season,
  price: p.price,
  imageUrl: imagePathFor(p.sku),
  variants: sizesFor(p).map((size) => ({ size, stock: p.soldOut ? 0 : stockFor(p.sku, size) })),
}));

const q = (patch: Partial<ParsedQuery>): ParsedQuery => ({ ...EMPTY_QUERY, ...patch });
const skus = (r: { results: { product: { sku: string } }[] }) => r.results.map((x) => x.product.sku);

test("narx darajasi kategoriya ichida uchga bo'linadi", () => {
  const tiers = priceTiers(products);
  const kostyum = products.filter((p) => p.category === "kostyum").sort((a, b) => a.price - b.price);
  assert.deepEqual(
    kostyum.map((p) => tiers.get(p.id)),
    ["arzon", "arzon", "orta", "orta", "qimmat", "qimmat"],
  );
});

test("CLAUDE.md misoli: ish uchun, qora emas, o'rta narx kostyum", () => {
  const r = matchProducts(products, q({ kategoriya: "kostyum", rang_istisno: ["qora"], maqsad: "ish", narx_darajasi: "orta" }));
  assert.equal(r.status, "qoniqtirildi");
  assert.equal(r.results.length, 3);
  assert.ok(r.results.every((x) => x.product.category === "kostyum" && x.product.color !== "qora"));
  // Aniq moslar avval
  assert.deepEqual(r.results.map((x) => x.isExact), [true, true, false]);
  assert.deepEqual(skus(r).slice(0, 2).sort(), ["KS-02", "KS-06"]);
});

test("qizil libos tugagan: o'xshashlari 'qisman' holat bilan", () => {
  const r = matchProducts(products, q({ kategoriya: "libos", ranglar: ["qizil"], maqsad: "bayram" }));
  assert.equal(r.status, "qisman");
  assert.ok(!skus(r).includes("LB-02"), "tugagan tovar chiqmasligi kerak");
  assert.ok(r.results.every((x) => !x.isExact && x.reason === "Shu rangda yo'q, o'xshashi bor"));
});

test("omborda yo'q kategoriya: qoniqtirilmadi", () => {
  const r = matchProducts(products, q({ kategoriya: "krossovka", ranglar: ["oq"] }));
  assert.equal(r.status, "qoniqtirilmadi");
  assert.equal(r.results.length, 0);
});

test("jins filtri uniseksni ham o'tkazadi, qarama-qarshi jinsni o'tkazmaydi", () => {
  const r = matchProducts(products, q({ kategoriya: "futbolka", jins: "ayol" }), 10);
  assert.ok(r.results.length > 0);
  assert.ok(r.results.every((x) => x.product.gender !== "erkak"));
});

test("qoldig'i 0 bo'lgan tovar hech qachon chiqmaydi", () => {
  const r = matchProducts(products, q({}), 100);
  assert.ok(r.results.every((x) => x.product.variants.some((v) => v.stock > 0)));
  assert.ok(!skus(r).includes("KT-06"));
});

test("natija deterministik", () => {
  const query = q({ maqsad: "bayram" });
  assert.deepEqual(skus(matchProducts(products, query)), skus(matchProducts(products, query)));
});
