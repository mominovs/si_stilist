// Katalog lug'ati: admin formasi, seed va (2-bosqichda) LLM prompti shu ro'yxatlardan foydalanadi.
// Admin yangi kategoriya yoki rang kiritishi mumkin; bu ro'yxatlar faqat taklif.

export const CATEGORIES = [
  "ko'ylak",
  "futbolka",
  "shim",
  "kostyum",
  "libos",
  "kurtka",
  "sviter",
  "yubka",
] as const;

// Rang nomi -> rasm va belgilar uchun HEX
export const COLORS: Record<string, string> = {
  qora: "#1f1f1f",
  oq: "#f4f4f2",
  kulrang: "#8a8d91",
  "to'q ko'k": "#1e2a4a",
  "ko'k": "#3b6fb6",
  jigarrang: "#6b4423",
  bej: "#d8c3a5",
  qizil: "#b3262e",
  yashil: "#3f6b45",
  pushti: "#e8a0b4",
  sariq: "#e3b62f",
  bordo: "#6d1a2b",
};

export const STYLE_TAGS = ["ish", "kundalik", "bayram", "sport", "klassik", "zamonaviy"] as const;

export const SEASONS = ["hamma", "yoz", "bahor-kuz", "qish"] as const;

export const GENDERS = ["erkak", "ayol", "unisex"] as const;

export const GENDER_LABELS: Record<(typeof GENDERS)[number], string> = {
  erkak: "Erkak",
  ayol: "Ayol",
  unisex: "Uniseks",
};

export const SEASON_LABELS: Record<(typeof SEASONS)[number], string> = {
  hamma: "Mavsumsiz",
  yoz: "Yoz",
  "bahor-kuz": "Bahor-kuz",
  qish: "Qish",
};

export const LETTER_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
export const NUMERIC_SIZES = ["44", "46", "48", "50", "52", "54"];

export function colorHex(color: string): string {
  return COLORS[color.toLowerCase()] ?? "#9ca3af";
}
