// Demo ombori: 8 kategoriya x 6 tovar = 48 ta tovar.
// Ataylab qoldirilgan bo'shliqlar (qoniqtirilmagan talabni ko'rsatish uchun):
//   - krossovka, palto, sumka kategoriyalari umuman yo'q
//   - qizil bayram libosi va oq puxovik butunlay tugagan (qoldiq 0)
//   - ayrim o'lchamlar tugagan

type Gender = "erkak" | "ayol" | "unisex";

export type SeedProduct = {
  sku: string;
  name: string;
  category: string;
  gender: Gender;
  color: string;
  styleTags: string[];
  season: "hamma" | "yoz" | "bahor-kuz" | "qish";
  price: number;
  description?: string;
  soldOut?: boolean;
};

export const seedProducts: SeedProduct[] = [
  // ko'ylak
  { sku: "KY-01", name: "Oq klassik ko'ylak", category: "ko'ylak", gender: "erkak", color: "oq", styleTags: ["ish", "klassik"], season: "hamma", price: 249000, description: "Paxta, to'g'ri bichim, ofis uchun" },
  { sku: "KY-02", name: "Havorang ofis ko'ylagi", category: "ko'ylak", gender: "erkak", color: "ko'k", styleTags: ["ish", "klassik"], season: "hamma", price: 229000 },
  { sku: "KY-03", name: "Kulrang slim ko'ylak", category: "ko'ylak", gender: "erkak", color: "kulrang", styleTags: ["ish", "zamonaviy"], season: "hamma", price: 289000 },
  { sku: "KY-04", name: "Pushti ayollar bluzkasi", category: "ko'ylak", gender: "ayol", color: "pushti", styleTags: ["ish", "bayram"], season: "yoz", price: 319000 },
  { sku: "KY-05", name: "Oq ipak bluzka", category: "ko'ylak", gender: "ayol", color: "oq", styleTags: ["bayram", "klassik"], season: "hamma", price: 449000 },
  { sku: "KY-06", name: "Yashil zig'ir ko'ylak", category: "ko'ylak", gender: "erkak", color: "yashil", styleTags: ["kundalik"], season: "yoz", price: 179000 },

  // futbolka
  { sku: "FT-01", name: "Oq bazaviy futbolka", category: "futbolka", gender: "unisex", color: "oq", styleTags: ["kundalik", "sport"], season: "yoz", price: 89000 },
  { sku: "FT-02", name: "Qora oversize futbolka", category: "futbolka", gender: "unisex", color: "qora", styleTags: ["kundalik", "zamonaviy"], season: "yoz", price: 129000 },
  { sku: "FT-03", name: "Kulrang sport futbolkasi", category: "futbolka", gender: "erkak", color: "kulrang", styleTags: ["sport"], season: "yoz", price: 149000 },
  { sku: "FT-04", name: "Bej polo futbolka", category: "futbolka", gender: "erkak", color: "bej", styleTags: ["kundalik", "ish"], season: "yoz", price: 199000 },
  { sku: "FT-05", name: "Sariq ayollar futbolkasi", category: "futbolka", gender: "ayol", color: "sariq", styleTags: ["kundalik", "zamonaviy"], season: "yoz", price: 99000 },
  { sku: "FT-06", name: "To'q ko'k polo", category: "futbolka", gender: "erkak", color: "to'q ko'k", styleTags: ["kundalik", "ish"], season: "yoz", price: 219000 },

  // shim
  { sku: "SH-01", name: "Qora klassik shim", category: "shim", gender: "erkak", color: "qora", styleTags: ["ish", "klassik"], season: "hamma", price: 349000 },
  { sku: "SH-02", name: "Kulrang ofis shimi", category: "shim", gender: "erkak", color: "kulrang", styleTags: ["ish", "klassik"], season: "hamma", price: 389000 },
  { sku: "SH-03", name: "Ko'k jinsi shim", category: "shim", gender: "unisex", color: "ko'k", styleTags: ["kundalik"], season: "hamma", price: 299000 },
  { sku: "SH-04", name: "Bej chinos", category: "shim", gender: "erkak", color: "bej", styleTags: ["kundalik", "zamonaviy"], season: "bahor-kuz", price: 279000 },
  { sku: "SH-05", name: "Qora sport shimi", category: "shim", gender: "unisex", color: "qora", styleTags: ["sport"], season: "hamma", price: 199000 },
  { sku: "SH-06", name: "Oq keng ayollar shimi", category: "shim", gender: "ayol", color: "oq", styleTags: ["kundalik", "zamonaviy"], season: "yoz", price: 329000 },

  // kostyum
  { sku: "KS-01", name: "To'q ko'k klassik kostyum", category: "kostyum", gender: "erkak", color: "to'q ko'k", styleTags: ["ish", "klassik"], season: "hamma", price: 1890000, description: "Jun aralash mato, ikki tugmali" },
  { sku: "KS-02", name: "Kulrang ish kostyumi", category: "kostyum", gender: "erkak", color: "kulrang", styleTags: ["ish", "klassik"], season: "hamma", price: 1590000 },
  { sku: "KS-03", name: "Qora bayramona kostyum", category: "kostyum", gender: "erkak", color: "qora", styleTags: ["bayram", "klassik"], season: "hamma", price: 2490000 },
  { sku: "KS-04", name: "Bej yozgi kostyum", category: "kostyum", gender: "erkak", color: "bej", styleTags: ["bayram", "zamonaviy"], season: "yoz", price: 1390000 },
  { sku: "KS-05", name: "Ayollar oq ofis kostyumi", category: "kostyum", gender: "ayol", color: "oq", styleTags: ["ish", "zamonaviy"], season: "hamma", price: 1290000 },
  { sku: "KS-06", name: "Bordo ayollar kostyumi", category: "kostyum", gender: "ayol", color: "bordo", styleTags: ["bayram", "ish"], season: "bahor-kuz", price: 1490000 },

  // libos
  { sku: "LB-01", name: "Qora kechki libos", category: "libos", gender: "ayol", color: "qora", styleTags: ["bayram", "klassik"], season: "hamma", price: 890000 },
  { sku: "LB-02", name: "Qizil bayram libosi", category: "libos", gender: "ayol", color: "qizil", styleTags: ["bayram"], season: "hamma", price: 990000, soldOut: true },
  { sku: "LB-03", name: "Bej ofis libosi", category: "libos", gender: "ayol", color: "bej", styleTags: ["ish", "klassik"], season: "hamma", price: 590000 },
  { sku: "LB-04", name: "Yashil yozgi libos", category: "libos", gender: "ayol", color: "yashil", styleTags: ["kundalik"], season: "yoz", price: 390000 },
  { sku: "LB-05", name: "Pushti gulli sarafan", category: "libos", gender: "ayol", color: "pushti", styleTags: ["kundalik", "zamonaviy"], season: "yoz", price: 349000 },
  { sku: "LB-06", name: "To'q ko'k midi libos", category: "libos", gender: "ayol", color: "to'q ko'k", styleTags: ["ish", "bayram"], season: "bahor-kuz", price: 690000 },

  // kurtka
  { sku: "KT-01", name: "Qora charm kurtka", category: "kurtka", gender: "erkak", color: "qora", styleTags: ["kundalik", "zamonaviy"], season: "bahor-kuz", price: 1290000 },
  { sku: "KT-02", name: "Bej trench", category: "kurtka", gender: "ayol", color: "bej", styleTags: ["ish", "klassik"], season: "bahor-kuz", price: 1190000 },
  { sku: "KT-03", name: "To'q ko'k qishki kurtka", category: "kurtka", gender: "erkak", color: "to'q ko'k", styleTags: ["kundalik"], season: "qish", price: 1490000 },
  { sku: "KT-04", name: "Kulrang sport kurtka", category: "kurtka", gender: "unisex", color: "kulrang", styleTags: ["sport"], season: "bahor-kuz", price: 549000 },
  { sku: "KT-05", name: "Yashil bomber", category: "kurtka", gender: "erkak", color: "yashil", styleTags: ["kundalik", "zamonaviy"], season: "bahor-kuz", price: 690000 },
  { sku: "KT-06", name: "Oq ayollar puxovigi", category: "kurtka", gender: "ayol", color: "oq", styleTags: ["kundalik"], season: "qish", price: 1590000, soldOut: true },

  // sviter
  { sku: "SV-01", name: "Kulrang jun sviter", category: "sviter", gender: "erkak", color: "kulrang", styleTags: ["kundalik", "ish"], season: "qish", price: 399000 },
  { sku: "SV-02", name: "Bej trikotaj sviter", category: "sviter", gender: "ayol", color: "bej", styleTags: ["kundalik"], season: "qish", price: 349000 },
  { sku: "SV-03", name: "Qora vodolazka", category: "sviter", gender: "unisex", color: "qora", styleTags: ["ish", "klassik"], season: "qish", price: 259000 },
  { sku: "SV-04", name: "Bordo kardigan", category: "sviter", gender: "ayol", color: "bordo", styleTags: ["kundalik", "ish"], season: "bahor-kuz", price: 429000 },
  { sku: "SV-05", name: "To'q ko'k sviter", category: "sviter", gender: "erkak", color: "to'q ko'k", styleTags: ["ish", "klassik"], season: "qish", price: 379000 },
  { sku: "SV-06", name: "Oq oversize xudi", category: "sviter", gender: "unisex", color: "oq", styleTags: ["sport", "kundalik"], season: "bahor-kuz", price: 299000 },

  // yubka
  { sku: "YB-01", name: "Qora qalam yubka", category: "yubka", gender: "ayol", color: "qora", styleTags: ["ish", "klassik"], season: "hamma", price: 279000 },
  { sku: "YB-02", name: "Bej plisse yubka", category: "yubka", gender: "ayol", color: "bej", styleTags: ["ish", "zamonaviy"], season: "hamma", price: 329000 },
  { sku: "YB-03", name: "Ko'k jinsi yubka", category: "yubka", gender: "ayol", color: "ko'k", styleTags: ["kundalik"], season: "yoz", price: 249000 },
  { sku: "YB-04", name: "Qizil midi yubka", category: "yubka", gender: "ayol", color: "qizil", styleTags: ["bayram"], season: "hamma", price: 369000 },
  { sku: "YB-05", name: "Kulrang jun yubka", category: "yubka", gender: "ayol", color: "kulrang", styleTags: ["ish"], season: "qish", price: 299000 },
  { sku: "YB-06", name: "Yashil atlas yubka", category: "yubka", gender: "ayol", color: "yashil", styleTags: ["bayram", "zamonaviy"], season: "hamma", price: 419000 },
];

const NUMERIC = ["44", "46", "48", "50", "52", "54"];
const LETTERS = ["XS", "S", "M", "L", "XL", "XXL"];

// Jins va kategoriyaga qarab o'lchamlar oralig'i
export function sizesFor(p: SeedProduct): string[] {
  const numeric = p.category === "shim" || p.category === "kostyum";
  const scale = numeric ? NUMERIC : LETTERS;
  if (p.gender === "ayol") return scale.slice(0, 5);
  if (p.gender === "erkak") return scale.slice(1, 6);
  return scale.slice(1, 5);
}

// Deterministik "tasodifiy" qoldiq: seed har safar bir xil ombor beradi
export function stockFor(sku: string, size: string): number {
  let h = 0;
  for (const ch of sku + size) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const n = h % 10;
  return n < 2 ? 0 : n - 1; // ~20% o'lchamlar tugagan, qolganlari 1..8
}

export function imagePathFor(sku: string): string {
  return `/products/${sku.toLowerCase()}.svg`;
}
