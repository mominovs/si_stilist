// Seed tovarlari uchun rasm yaratish prompt'lari (Qwen-Image, ChatGPT va h.k.): docs/product-photo-prompts.md
//   npm run images:prompts

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { seedProducts } from "../prisma/seed-data/products";

const COLOR_EN: Record<string, string> = {
  qora: "black", oq: "white", kulrang: "gray", "to'q ko'k": "navy blue", "ko'k": "light blue",
  jigarrang: "brown", bej: "beige", qizil: "red", yashil: "green", pushti: "pink", sariq: "mustard yellow", bordo: "burgundy",
};

const ITEM_EN: Record<string, string> = {
  "ko'ylak": "button-up shirt",
  futbolka: "t-shirt",
  shim: "trousers",
  kostyum: "two-piece suit (jacket and trousers)",
  libos: "dress",
  kurtka: "jacket",
  sviter: "sweater",
  yubka: "skirt",
};

// Nomdagi aniqlashtiruvchi so'zlar promptni aniqroq qiladi: sifatlar (material, bichim) va ot (kiyim turi)
const MODIFIERS: [RegExp, string][] = [
  [/jinsi/i, "denim"], [/charm/i, "leather"], [/ipak/i, "silk"], [/zig'ir/i, "linen"], [/jun/i, "wool"],
  [/plisse/i, "pleated"], [/qalam/i, "pencil"], [/atlas/i, "satin"], [/midi/i, "midi"], [/kechki/i, "evening"],
  [/oversize/i, "oversize"], [/chinos/i, "chino"], [/sport/i, "athletic"], [/keng/i, "wide-leg"],
  [/trikotaj/i, "knit"], [/gulli/i, "floral"], [/qishki/i, "winter"],
];
const NOUNS: [RegExp, string][] = [
  [/polo/i, "polo shirt"], [/trench/i, "trench coat"], [/bomber/i, "bomber jacket"], [/puxovik/i, "puffer down jacket"],
  [/xudi/i, "hoodie"], [/vodolazka/i, "turtleneck sweater"], [/kardigan/i, "cardigan"], [/bluzka/i, "blouse"],
  [/sarafan/i, "sundress"],
];

const GENDER_EN = { erkak: "men's", ayol: "women's", unisex: "unisex" } as const;

function prompt(p: (typeof seedProducts)[number]): string {
  const mods = MODIFIERS.filter(([re]) => re.test(p.name)).map(([, en]) => en);
  const noun = NOUNS.find(([re]) => re.test(p.name))?.[1] ?? ITEM_EN[p.category] ?? p.category;
  const item = [...mods, noun].join(" ");
  return [
    `Professional e-commerce product photo of a ${COLOR_EN[p.color] ?? p.color} ${GENDER_EN[p.gender]} ${item},`,
    "ghost mannequin style, front view, centered, full garment visible,",
    "pure white background, soft even studio lighting, realistic fabric texture, high detail,",
    "no person, no hanger, no text, no logo.",
  ].join(" ");
}

const lines = [
  "# Tovar rasmlari uchun prompt'lar",
  "",
  "`npm run images:prompts` bilan avtomatik yaratilgan. Har bir rasmni `public/products/<fayl>` nomi bilan saqlang,",
  "keyin `npm run images:apply` buyrug'i ularni bazaga ulaydi. O'lcham: 768x1024 (3:4) yoki 1024x1024.",
  "",
  "| SKU | Tovar | Fayl | Prompt |",
  "| --- | --- | --- | --- |",
  ...seedProducts.map((p) => `| ${p.sku} | ${p.name} | \`${p.sku.toLowerCase()}.jpg\` | ${prompt(p)} |`),
  "",
];
const out = path.join(process.cwd(), "docs", "product-photo-prompts.md");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, lines.join("\n"));
console.log(`${seedProducts.length} ta prompt yozildi: docs/product-photo-prompts.md`);
