import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateBody, fitAccuracy, fitSizes, median, sizeSpec } from "./sizing";

const tee = { gender: "erkak" as const, category: "futbolka" };
const sizes = ["S", "M", "L", "XL", "XXL"];

test("ma'lumot bo'lmasa tavsiya yo'q", () => {
  assert.equal(estimateBody({ gender: "erkak" }), null);
  assert.equal(fitSizes(sizes, null, tee).recommended, null);
  // Chegaradan tashqari qiymatlar hisobga olinmaydi
  assert.equal(estimateBody({ gender: "erkak", heightCm: 30, weightKg: 900 }), null);
});

test("o'rtacha erkak (176 sm, 75 kg) -> M, kichigi tor, kattasi keng", () => {
  const body = estimateBody({ gender: "erkak", heightCm: 176, weightKg: 75 })!;
  assert.equal(body.confidence, "orta");
  const { fits, recommended } = fitSizes(sizes, body, tee);
  assert.equal(recommended, "M");
  assert.equal(fits.get("M")!.overall, "mos");
  assert.equal(fits.get("S")!.overall, "tor");
  assert.equal(fits.get("L")!.overall, "keng");
  assert.equal(fits.get("XL")!.overall, "juda-keng");
});

test("og'irroq gavda kattaroq o'lcham oladi, S unga to'g'ri kelmaydi", () => {
  const body = estimateBody({ gender: "erkak", heightCm: 176, weightKg: 98 })!;
  const { fits, recommended } = fitSizes(sizes, body, tee);
  assert.equal(recommended, "XL");
  assert.equal(fits.get("S")!.overall, "juda-tor");
});

test("kurtka ustidan kiyiladi: shu gavdaga bir o'lcham kattaroq", () => {
  const body = estimateBody({ gender: "erkak", heightCm: 176, weightKg: 75 })!;
  const tShirt = fitSizes(sizes, body, tee).recommended!;
  const jacket = fitSizes(sizes, body, { gender: "erkak", category: "kurtka" }).recommended!;
  assert.equal(sizes.indexOf(jacket), sizes.indexOf(tShirt) + 1);
});

test("ayollar jadvali va raqamli o'lcham", () => {
  const body = estimateBody({ gender: "ayol", heightCm: 164, weightKg: 58 })!;
  assert.equal(fitSizes(["XS", "S", "M", "L", "XL"], body, { gender: "ayol", category: "ko'ylak" }).recommended, "S");
  assert.equal(sizeSpec("48", "erkak")!.chestCm, 96);
  assert.equal(sizeSpec("one size", "erkak"), null);
});

test("kamera keng yelkani ko'rsa, tavsiya kattalashadi va ishonch oshadi", () => {
  const base = estimateBody({ gender: "erkak", heightCm: 176, weightKg: 75 })!;
  const wide = estimateBody({ gender: "erkak", heightCm: 176, weightKg: 75, shoulderRatio: 0.75 })!;
  assert.equal(wide.confidence, "yuqori");
  assert.ok(wide.shoulderCm > base.shoulderCm + 5);
  assert.ok(wide.chestCm > base.chestCm);
  // Odatdagi nisbat o'rtacha yelka beradi; faqat kamera: past ishonch, lekin baho bor
  const typical = estimateBody({ gender: "erkak", shoulderRatio: 0.62 })!;
  assert.equal(typical.shoulderCm, 40);
  assert.equal(typical.confidence, "past");
  // Poza xatosi (juda katta nisbat) yelkani 20% dan ortiq o'zgartirmaydi
  assert.equal(estimateBody({ gender: "erkak", shoulderRatio: 1.15 })!.shoulderCm, 48);
});

test("median va aniqlik hisobi", () => {
  assert.equal(median([0.7, 0.71, 2, 0.69, 0.72]), 0.71);
  assert.equal(median([]), null);
  assert.deepEqual(
    fitAccuracy([
      { recommended: "M", fitted: "M" },
      { recommended: "M", fitted: "L" },
      { recommended: "S", fitted: "XL" },
      { recommended: "48", fitted: "50" },
      { recommended: "M", fitted: "?" },
    ]),
    { n: 4, exact: 1, within1: 3 },
  );
});
