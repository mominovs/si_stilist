// Kalit so'zlarga asoslangan oddiy tahlilchi: LLM yoki internet ishlamaganda zaxira sifatida ishlaydi.
// O'zbekcha (lotin va kirill) hamda ruscha so'zlarni taniydi. Deterministik, tashqi xizmatsiz.

import { EMPTY_QUERY, type ParsedQuery } from "./schema";

const CYR_TO_LAT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", ғ: "g'", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y",
  к: "k", қ: "q", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ў: "o'",
  ф: "f", х: "x", ҳ: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "'", ь: "", ы: "i", э: "e", ю: "yu", я: "ya",
};

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ʻʼ‘’`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function transliterate(text: string): string {
  return [...text].map((ch) => CYR_TO_LAT[ch] ?? ch).join("");
}

// Kategoriya -> sinonimlar (so'z boshi bo'yicha qidiriladi). Ruscha so'zlar kirillda qoladi.
export const CATEGORY_SYNONYMS: Record<string, string[]> = {
  "ko'ylak": ["ko'ylak", "koylak", "kuylak", "rubashk", "рубашк", "bluzk", "блузк"],
  futbolka: ["futbolk", "футболк", "polo", "поло", "mayka", "майк"],
  shim: ["shim", "jinsi", "brjuk", "брюк", "джинс", "штан", "chinos"],
  kostyum: ["kostyum", "kostum", "костюм"],
  libos: ["libos", "плать", "sarafan", "сарафан"],
  kurtka: ["kurtk", "куртк", "puxovik", "пуховик", "trench", "тренч", "bomber", "бомбер"],
  sviter: ["sviter", "свитер", "kardigan", "кардиган", "xudi", "худи", "vodolazk", "водолазк", "кофт", "kofta"],
  yubka: ["yubk", "юбк"],
  // Omborda yo'q, lekin talabni yozib olish uchun taniladi
  krossovka: ["krossovk", "krasovk", "кроссовк", "кросовк", "snikers"],
  palto: ["palto", "пальто"],
  sumka: ["sumk", "сумк"],
  tufli: ["tufli", "туфл"],
  etik: ["etik", "сапог", "botinka", "ботинк"],
  shorti: ["short", "шорт"],
};

export const COLOR_SYNONYMS: Record<string, string[]> = {
  // "to'q ko'k" "ko'k" dan oldin tekshiriladi
  "to'q ko'k": ["to'q ko'k", "toq kok", "темно-син", "темно син", "тёмно-син", "navy"],
  qora: ["qora", "чёрн", "черн"],
  oq: ["oq", "бел"],
  kulrang: ["kulrang", "серый", "серая", "серое", "серого", "серую"],
  "ko'k": ["ko'k", "kok", "havorang", "син", "голуб"],
  jigarrang: ["jigarrang", "коричнев"],
  bej: ["bej", "беж"],
  qizil: ["qizil", "красн"],
  yashil: ["yashil", "зелен", "зелён"],
  pushti: ["pushti", "розов"],
  sariq: ["sariq", "жёлт", "желт"],
  bordo: ["bordo", "бордо", "бордов"],
};

const GENDER_WORDS: Record<"erkak" | "ayol", string[]> = {
  erkak: ["erkak", "yigit", "o'g'il", "erim", "akam", "dadam", "мужск", "мужчин", "мужа", "парн"],
  ayol: ["ayol", "qizim", "qizlar", "qiz bola", "qizga", "qiz uchun", "opam", "onam", "xotin", "singlim", "женск", "женщин", "девушк", "жены"],
};

const PURPOSE_WORDS: Record<string, string[]> = {
  ish: ["ish", "ofis", "офис", "работ"],
  bayram: ["bayram", "to'y", "toy", "kechki", "праздн", "свадьб", "вечерн", "торжеств"],
  sport: ["sport", "спорт", "zal", "трениров"],
  kundalik: ["kundalik", "har kuni", "sayr", "повседнев", "на каждый день", "прогулк"],
};

const STYLE_WORDS: Record<string, string[]> = {
  klassik: ["klassik", "классич"],
  zamonaviy: ["zamonaviy", "modern", "модн", "стильн", "современ"],
};

const PRICE_WORDS: Array<["arzon" | "orta" | "qimmat", string[]]> = [
  // "qimmat emas" -> arzon, shuning uchun arzon birinchi
  ["arzon", ["arzon", "qimmat emas", "qimmat bo'lmagan", "дешев", "недорог", "бюджет"]],
  ["orta", ["o'rtacha", "o'rta", "orta narx", "средн"]],
  ["qimmat", ["qimmat", "premium", "премиум", "дорог", "люкс"]],
];

const SEASON_WORDS: Record<string, string[]> = {
  qish: ["qish", "зим"],
  yoz: ["yoz", "лет"],
  "bahor-kuz": ["bahor", "kuz", "весн", "осен", "демисезон"],
};

// Sinonim so'z boshida turishi kerak ("ish" -> "ishga" mos, "kishi" mos emas)
function findWord(hay: string, word: string, from = 0): number {
  let idx = hay.indexOf(word, from);
  while (idx !== -1) {
    const prev = idx === 0 ? " " : hay[idx - 1];
    if (!/[\p{L}']/u.test(prev)) return idx;
    idx = hay.indexOf(word, idx + 1);
  }
  return -1;
}

function containsAny(texts: string[], words: string[]): boolean {
  return texts.some((t) => words.some((w) => findWord(t, w) !== -1));
}

const NEGATION_AFTER = /^[\p{L}']*\s?(rang(i|da|li)?\s?)?(siz|bo'lmasin|bo'lmagan|emas|dan boshqa|dan tashqari)/u;
const NEGATION_BEFORE = /(не|без|кроме|nе)\s*$/u;

function detectColors(texts: string[]): { include: string[]; exclude: string[] } {
  const include = new Set<string>();
  const exclude = new Set<string>();
  const consumed: Array<[number, number, number]> = []; // [textIndex, start, end]

  for (const [color, words] of Object.entries(COLOR_SYNONYMS)) {
    texts.forEach((t, ti) => {
      for (const w of words) {
        let idx = findWord(t, w);
        while (idx !== -1) {
          const end = idx + w.length;
          const overlaps = consumed.some(([cti, s, e]) => cti === ti && idx < e && end > s);
          if (!overlaps) {
            consumed.push([ti, idx, end]);
            const after = t.slice(end, end + 25);
            const before = t.slice(Math.max(0, idx - 8), idx);
            if (NEGATION_AFTER.test(after) || NEGATION_BEFORE.test(before)) exclude.add(color);
            else include.add(color);
          }
          idx = findWord(t, w, end);
        }
      }
    });
  }
  for (const c of exclude) include.delete(c);
  return { include: [...include], exclude: [...exclude] };
}

/** Matndan birinchi tanilgan kategoriyani qaytaradi (LLM natijasini normallashtirishda ham ishlatiladi) */
export function detectCategory(text: string): string | null {
  const t = normalizeText(text);
  const texts = [t, transliterate(t)];
  for (const [cat, words] of Object.entries(CATEGORY_SYNONYMS)) {
    if (containsAny(texts, words)) return cat;
  }
  return null;
}

export function detectColor(text: string): string | null {
  const t = normalizeText(text);
  const { include, exclude } = detectColors([t, transliterate(t)]);
  return include[0] ?? exclude[0] ?? null;
}

function detectSize(original: string): string | null {
  const letter = original.match(/(?:^|[^\p{L}])(XXL|XL|XS|S|M|L)(?=$|[^\p{L}])/u);
  if (letter) return letter[1];
  const numeric = original.match(/(?:^|\D)(3[6-9]|4\d|5[0-8])(?=\s*(-?\s*o'lcham|razmer|размер|\b|$))/u);
  return numeric ? numeric[1] : null;
}

export function parseByKeywords(text: string): ParsedQuery {
  const t = normalizeText(text);
  const texts = [t, transliterate(t)];

  const pickAll = (dict: Record<string, string[]>) =>
    Object.entries(dict)
      .filter(([, words]) => containsAny(texts, words))
      .map(([key]) => key);

  const purposes = pickAll(PURPOSE_WORDS);
  const genders = (Object.keys(GENDER_WORDS) as Array<"erkak" | "ayol">).filter((g) =>
    containsAny(texts, GENDER_WORDS[g]),
  );
  const colors = detectColors(texts);
  const price = PRICE_WORDS.find(([, words]) => containsAny(texts, words))?.[0] ?? null;
  const season = pickAll(SEASON_WORDS)[0] ?? null;

  return {
    ...EMPTY_QUERY,
    kategoriya: detectCategory(t),
    jins: genders.length === 1 ? genders[0] : null,
    ranglar: colors.include,
    rang_istisno: colors.exclude,
    uslub: pickAll(STYLE_WORDS),
    maqsad: purposes[0] ?? null,
    narx_darajasi: price,
    olcham: detectSize(text.replace(/[ʻʼ‘’`´]/g, "'")),
    mavsum: season,
    izoh: text.trim().slice(0, 200),
  };
}
