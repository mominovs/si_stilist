// Platforma namunasi: 5 ta do'kon, har xil shaharlarda. Nomlar faqat tushuntirish uchun (hamkorlik emas):
// interfeysda "Namuna" yozuvi turadi. Haqiqiy do'kon ulanganda shu ro'yxat o'rniga admin orqali qo'shiladi.
// Manzil, telefon va sayt ataylab bo'sh: "Sotib olish" hozircha hech qayerga olib bormaydi.

export type SeedStore = { slug: string; name: string; city: string; color: string };

export const seedStores: SeedStore[] = [
  { slug: "lc-waikiki", name: "LC Waikiki", city: "Toshkent", color: "#2457A6" },
  { slug: "defacto", name: "DeFacto", city: "Toshkent", color: "#1E1E1E" },
  { slug: "koton", name: "Koton", city: "Samarqand", color: "#B4232A" },
  { slug: "colins", name: "Colin's", city: "Farg'ona", color: "#2E7D5B" },
  { slug: "mavi", name: "Mavi", city: "Andijon", color: "#0E7490" },
];

// Kategoriyalar tartibi (SKU prefiksi): har do'konga har xil turdagi tovarlar tushsin
const PREFIXES = ["ft", "ks", "kt", "ky", "lb", "sh", "sv", "yb"];

/** Namuna tovar qaysi do'konga tegishli: "kt-03" -> kategoriya va raqam bo'yicha aylana (deterministik) */
export function storeSlugForSku(sku: string): string {
  const [prefix, num] = sku.toLowerCase().split("-");
  const i = Math.max(0, PREFIXES.indexOf(prefix)) + (Number(num) || 1) - 1;
  return seedStores[i % seedStores.length].slug;
}
