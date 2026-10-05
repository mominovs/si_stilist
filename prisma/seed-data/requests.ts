// Panel uchun namunaviy so'rovlar tarixi (oxirgi 7 kun). mode = "namuna" bilan belgilanadi,
// shuning uchun panelda haqiqiy so'rovlardan ajralib turadi va "Logni tozalash" bilan o'chiriladi.
// Holat va natijalar seed paytida haqiqiy moslashtirish funksiyasi bilan hisoblanadi.

import type { ParsedQuery } from "../../src/lib/query/schema";

type Template = {
  texts: string[];
  parsed: Partial<ParsedQuery>;
  sizes?: string[];
  weight: number;
};

export const requestTemplates: Template[] = [
  // Do'konda umuman yo'q kategoriyalar
  { texts: ["oq krossovka bormi 42", "Нужны белые кроссовки 42 размера", "42 razmer oq krossovka kerak"], parsed: { kategoriya: "krossovka", ranglar: ["oq"] }, sizes: ["42", "42", "43", "41"], weight: 9 },
  { texts: ["ayollar uchun qora palto, qishga", "qishki qora palto kerak", "Женское чёрное пальто на зиму"], parsed: { kategoriya: "palto", ranglar: ["qora"], jins: "ayol", mavsum: "qish" }, weight: 6 },
  { texts: ["qora sumka bormi", "ayollar uchun qora sumka"], parsed: { kategoriya: "sumka", ranglar: ["qora"] }, weight: 3 },
  { texts: ["yozgi shorti erkaklar uchun", "erkaklar shortisi"], parsed: { kategoriya: "shorti", jins: "erkak", mavsum: "yoz" }, weight: 2 },
  // Kategoriya bor, lekin aynan so'ralgani tugagan
  { texts: ["To'yga qizil libos", "qizil kechki libos kerak", "Красное платье на свадьбу"], parsed: { kategoriya: "libos", ranglar: ["qizil"], maqsad: "bayram" }, sizes: ["S", "M"], weight: 7 },
  { texts: ["oq puxovik ayollar uchun", "qishga oq kurtka, ayollar"], parsed: { kategoriya: "kurtka", ranglar: ["oq"], jins: "ayol", mavsum: "qish" }, weight: 4 },
  // Qoniqtirilgan so'rovlar
  { texts: ["Ishga kiyadigan, qora rangsiz, o'rtacha narxdagi kostyum", "ofis uchun kostyum, qora bo'lmasin"], parsed: { kategoriya: "kostyum", maqsad: "ish", rang_istisno: ["qora"], narx_darajasi: "orta" }, weight: 6 },
  { texts: ["ofisga oq ko'ylak", "oq klassik ko'ylak, L o'lcham"], parsed: { kategoriya: "ko'ylak", ranglar: ["oq"], maqsad: "ish", uslub: ["klassik"] }, weight: 5 },
  { texts: ["sport futbolka", "zalga futbolka kerak"], parsed: { kategoriya: "futbolka", maqsad: "sport" }, weight: 4 },
  { texts: ["ko'k jinsi shim"], parsed: { kategoriya: "shim", ranglar: ["ko'k"], maqsad: "kundalik" }, weight: 3 },
  { texts: ["qishga issiq sviter", "kulrang jun sviter"], parsed: { kategoriya: "sviter", mavsum: "qish" }, weight: 3 },
  { texts: ["ishga qora yubka"], parsed: { kategoriya: "yubka", ranglar: ["qora"], maqsad: "ish" }, weight: 2 },
  { texts: ["yozgi yashil libos"], parsed: { kategoriya: "libos", ranglar: ["yashil"], mavsum: "yoz" }, weight: 2 },
];

/** Deterministik vaqt: oxirgi 7 kun ichida, bir xil seed har safar bir xil tarix beradi */
export function minutesAgoFor(i: number): number {
  return 20 + ((i * 7919) % (7 * 24 * 60 - 40));
}
