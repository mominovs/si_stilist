// O'lcham tavsiyasi: toza, deterministik funksiyalar (SI yo'q).
//
// Gavda o'lchami uch manbadan taxmin qilinadi, hammasi ixtiyoriy:
//  - bo'y (sm): kamera nisbatini santimetrga o'giradi (kamera masofani bilmaydi)
//  - vazn (kg): ko'krak aylanasi bo'y va vazndan (aylana ~ sqrt(vazn / bo'y))
//  - kamera: yelka kengligi / gavda uzunligi nisbati (jonli oyna serveri MediaPipe pozasidan beradi)
// Natija taxminiy: koeffitsiyentlar o'rtacha antropometriyadan, sinov (pilot) natijalari bilan aniqlashtiriladi.
// Xaridor ma'lumotlari faqat brauzerda hisoblanadi va saqlanmaydi.

export type BodyGender = "erkak" | "ayol";

export type BodyInput = {
  gender: BodyGender;
  heightCm?: number | null;
  weightKg?: number | null;
  /** Kameradan: yelka kengligi / gavda uzunligi (MediaPipe nuqtalari) */
  shoulderRatio?: number | null;
};

export type Confidence = "past" | "orta" | "yuqori";

export type BodyEstimate = {
  chestCm: number;
  shoulderCm: number;
  confidence: Confidence;
  sources: { height: boolean; weight: boolean; camera: boolean };
};

const DEFAULT_HEIGHT: Record<BodyGender, number> = { erkak: 176, ayol: 164 };
// Ko'krak aylanasi = K * sqrt(vazn / bo'y): 176 sm / 75 kg erkak -> ~98 sm (48-50 o'lcham)
const GIRTH_K: Record<BodyGender, number> = { erkak: 150, ayol: 147 };
// Kamera: MediaPipe yelka va son nuqtalari bo'g'imlarda, shuning uchun nisbat santimetrga to'g'ridan-to'g'ri
// o'girilmaydi: o'rtacha odamning nisbatiga solishtiriladi (shu nisbatdagi odam = o'rtacha yelka, bo'yiga mos).
// Odatdagi nisbat taxminiy (sinov suratlarida ~0.6): pilot natijalari bilan aniqlashtiriladi.
const TYPICAL_RATIO: Record<BodyGender, number> = { erkak: 0.62, ayol: 0.58 };
// Bitta kamera o'lchovi yelkani ko'pi bilan ±20% o'zgartiradi (poza xatosi tavsiyani buzib yubormasin)
const CAMERA_LIMIT = 0.2;
// O'rtacha kattalar (sm) va regressiya: yelka (suyak) ko'krakka qaraganda kam o'zgaradi (SD ~2 sm va ~8 sm, r ~0.6)
const MEAN: Record<BodyGender, { chest: number; shoulder: number }> = {
  erkak: { chest: 98, shoulder: 40 },
  ayol: { chest: 90, shoulder: 36 },
};
const shoulderFromChest = (g: BodyGender, chest: number) => MEAN[g].shoulder + 0.16 * (chest - MEAN[g].chest);
const chestFromShoulder = (g: BodyGender, shoulder: number) => MEAN[g].chest + 2.4 * (shoulder - MEAN[g].shoulder);

export const HEIGHT_RANGE = [120, 220] as const;
export const WEIGHT_RANGE = [30, 200] as const;

const inRange = (v: number | null | undefined, [lo, hi]: readonly [number, number]) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null;

/** Gavda o'lchamini taxmin qiladi. Hech qanday manba bo'lmasa null (tavsiya berilmaydi) */
export function estimateBody(input: BodyInput): BodyEstimate | null {
  const g = input.gender;
  const height = inRange(input.heightCm, HEIGHT_RANGE);
  const weight = inRange(input.weightKg, WEIGHT_RANGE);
  const ratio = inRange(input.shoulderRatio, [0.45, 1.2]);
  if (height === null && weight === null && ratio === null) return null;

  const h = height ?? DEFAULT_HEIGHT[g];
  const fromWeight = weight !== null ? GIRTH_K[g] * Math.sqrt(weight / h) : null;
  const relative = ratio !== null ? Math.min(1 + CAMERA_LIMIT, Math.max(1 - CAMERA_LIMIT, ratio / TYPICAL_RATIO[g])) : null;
  const shoulderCam = relative !== null ? MEAN[g].shoulder * relative * (h / DEFAULT_HEIGHT[g]) : null;
  const fromCamera = shoulderCam !== null ? chestFromShoulder(g, shoulderCam) : null;

  // Vazn ko'krak aylanasini yaxshiroq aytadi (yog' va mushak), kamera esa suyak kengligini
  const chest =
    fromWeight !== null && fromCamera !== null ? 0.7 * fromWeight + 0.3 * fromCamera : (fromWeight ?? fromCamera)!;
  const shoulder = shoulderCam ?? shoulderFromChest(g, chest);

  const n = Number(height !== null) + Number(weight !== null) + Number(ratio !== null);
  const confidence: Confidence =
    n === 3 ? "yuqori" : n === 2 && (weight !== null || (height !== null && ratio !== null)) ? "orta" : "past";
  return {
    chestCm: Math.round(chest * 10) / 10,
    shoulderCm: Math.round(shoulder * 10) / 10,
    confidence,
    sources: { height: height !== null, weight: weight !== null, camera: ratio !== null },
  };
}

// --- Kiyim o'lcham jadvali (tana o'lchami, sm: shu o'lcham kimga mo'ljallangan) ---
// Do'kon o'z jadvalini kiritmaguncha standart jadval (EU/RU harfli va raqamli o'lchamlar)

const LETTERS = ["XS", "S", "M", "L", "XL", "XXL"];
const LETTER_CHEST: Record<BodyGender, number[]> = {
  erkak: [86, 92, 99, 106, 113, 120],
  ayol: [80, 86, 92, 98, 104, 110],
};

export type SizeSpec = { chestCm: number; shoulderCm: number };

/**
 * O'lchamning tana o'lchami. productGender: tovar jinsi (uniseks erkaklar jadvali bo'yicha).
 * Noma'lum yozuv ("42-44", "one size") uchun null: bunday o'lchamga baho berilmaydi.
 */
export function sizeSpec(size: string, productGender: "erkak" | "ayol" | "unisex"): SizeSpec | null {
  const chart: BodyGender = productGender === "ayol" ? "ayol" : "erkak";
  const s = size.trim().toUpperCase().replace(/^2XL$/, "XXL");
  const i = LETTERS.indexOf(s);
  // Raqamli (ruscha) o'lcham: ko'krak aylanasining yarmi (48 -> 96 sm)
  const chest = i >= 0 ? LETTER_CHEST[chart][i] : /^\d{2}$/.test(s) && +s >= 38 && +s <= 70 ? +s * 2 : null;
  if (chest === null) return null;
  // Jadvalda yelka alohida berilmagan: shu ko'krakdagi o'rtacha yelka
  return { chestCm: chest, shoulderCm: Math.round(shoulderFromChest(chart, chest) * 10) / 10 };
}

/** O'lchamlar tartibi (±1 o'lcham aniqligi uchun): XS=0, S=1 ...; raqamli 44=0, 46=1 ... */
export function sizeIndex(size: string): number | null {
  const s = size.trim().toUpperCase().replace(/^2XL$/, "XXL");
  const i = LETTERS.indexOf(s);
  if (i >= 0) return i;
  return /^\d{2}$/.test(s) ? (Number(s) - 44) / 2 : null;
}

// --- Moslik ---

export type FitLevel = "juda-tor" | "tor" | "mos" | "keng" | "juda-keng";

export const FIT_LABELS: Record<FitLevel, { short: string; text: string }> = {
  "juda-tor": { short: "Juda tor", text: "Bu o'lcham sizga to'g'ri kelmaydi" },
  tor: { short: "Tor", text: "Tanaga yopishib turadi" },
  mos: { short: "Mos", text: "Sizga mos" },
  keng: { short: "Keng", text: "Erkin turadi" },
  "juda-keng": { short: "Katta", text: "Sizga katta keladi" },
};

const SEVERITY: Record<FitLevel, number> = { "juda-tor": 2, tor: 1, mos: 0, keng: 1, "juda-keng": 2 };

/** d: kiyim o'lchami - tana o'lchami (sm). Chegaralar: mato cho'zilishi va erkinlik hisobga olingan */
function level(d: number, [tight, tooTight, loose, tooLoose]: [number, number, number, number]): FitLevel {
  if (d < tooTight) return "juda-tor";
  if (d < tight) return "tor";
  if (d <= loose) return "mos";
  if (d <= tooLoose) return "keng";
  return "juda-keng";
}
const CHEST_LIMITS: [number, number, number, number] = [-3, -8, 4, 11];
const SHOULDER_LIMITS: [number, number, number, number] = [-1.5, -3.5, 2, 5];

// Ustidan kiyiladigan kiyim: tana o'lchamiga ichki kiyim qalinligi qo'shiladi
const LAYER_EASE: Record<string, { chest: number; shoulder: number }> = {
  kurtka: { chest: 6, shoulder: 1 },
  sviter: { chest: 2, shoulder: 0.5 },
  kostyum: { chest: 2, shoulder: 0.5 },
};

export type SizeFit = {
  size: string;
  chest: FitLevel;
  shoulder: FitLevel;
  /** Ikki zonadan og'irrog'i (teng bo'lsa ko'krak) */
  overall: FitLevel;
  /** Ko'krak farqi, sm (kiyim - tana) */
  chestDelta: number;
  score: number;
};

export function fitSize(
  size: string,
  body: BodyEstimate,
  product: { gender: "erkak" | "ayol" | "unisex"; category: string },
): SizeFit | null {
  const spec = sizeSpec(size, product.gender);
  if (!spec) return null;
  const ease = LAYER_EASE[product.category] ?? { chest: 0, shoulder: 0 };
  const dChest = spec.chestCm - (body.chestCm + ease.chest);
  const dShoulder = spec.shoulderCm - (body.shoulderCm + ease.shoulder);
  const chest = level(dChest, CHEST_LIMITS);
  const shoulder = level(dShoulder, SHOULDER_LIMITS);
  return {
    size,
    chest,
    shoulder,
    overall: SEVERITY[shoulder] > SEVERITY[chest] ? shoulder : chest,
    chestDelta: Math.round(dChest * 10) / 10,
    // Yelka farqi faqat kamera o'lchaganda ko'krakdan ajraladi; kamera koeffitsiyenti hali taxminiy, og'irligi teng
    score: Math.abs(dChest) + Math.abs(dShoulder),
  };
}

/** Har bir o'lcham bahosi va tavsiya (eng yaqin; teng bo'lsa kattarog'i). Omborda yo'q o'lcham ham baholanadi */
export function fitSizes(
  sizes: string[],
  body: BodyEstimate | null,
  product: { gender: "erkak" | "ayol" | "unisex"; category: string },
): { fits: Map<string, SizeFit>; recommended: string | null } {
  const fits = new Map<string, SizeFit>();
  if (!body) return { fits, recommended: null };
  let best: SizeFit | null = null;
  for (const size of sizes) {
    const f = fitSize(size, body, product);
    if (!f) continue;
    fits.set(size, f);
    if (!best || f.score < best.score - 1e-9 || (Math.abs(f.score - best.score) < 1e-9 && f.chestDelta > best.chestDelta)) {
      best = f;
    }
  }
  return { fits, recommended: best?.size ?? null };
}

/** Kameradan kelgan nisbatlar: o'rtacha qiymat (median), shovqin va bitta-ikkita xato kadr ta'sir qilmaydi */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Sinov natijasi: SI tavsiya qilgan va haqiqatda to'g'ri kelgan o'lcham */
export function fitAccuracy(rows: { recommended: string; fitted: string }[]) {
  let exact = 0;
  let within1 = 0;
  let n = 0;
  for (const r of rows) {
    const a = sizeIndex(r.recommended);
    const b = sizeIndex(r.fitted);
    if (a === null || b === null) continue;
    n++;
    if (a === b) exact++;
    if (Math.abs(a - b) <= 1) within1++;
  }
  return { n, exact, within1 };
}
