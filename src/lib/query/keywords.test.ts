import { test } from "node:test";
import assert from "node:assert/strict";
import { parseByKeywords } from "./keywords";

test("CLAUDE.md dagi misol", () => {
  const q = parseByKeywords("Ishga kiyadigan, qora rangsiz, o'rtacha narxdagi kostyum kerak");
  assert.equal(q.kategoriya, "kostyum");
  assert.deepEqual(q.rang_istisno, ["qora"]);
  assert.deepEqual(q.ranglar, []);
  assert.equal(q.maqsad, "ish");
  assert.equal(q.narx_darajasi, "orta");
});

test("kirill yozuvi", () => {
  const q = parseByKeywords("Байрамга қизил либос керак");
  assert.equal(q.kategoriya, "libos");
  assert.deepEqual(q.ranglar, ["qizil"]);
  assert.equal(q.maqsad, "bayram");
});

test("ruscha so'rov", () => {
  const q = parseByKeywords("Нужна недорогая мужская куртка на зиму, не черная");
  assert.equal(q.kategoriya, "kurtka");
  assert.equal(q.jins, "erkak");
  assert.equal(q.narx_darajasi, "arzon");
  assert.equal(q.mavsum, "qish");
  assert.deepEqual(q.rang_istisno, ["qora"]);
});

test("omborda yo'q kategoriya ham taniladi", () => {
  assert.equal(parseByKeywords("42 o'lchamli oq krossovka").kategoriya, "krossovka");
  assert.equal(parseByKeywords("42 o'lchamli oq krossovka").olcham, "42");
});

test("to'q ko'k va ko'k aralashmaydi", () => {
  const q = parseByKeywords("to'q ko'k ko'ylak, M o'lcham");
  assert.deepEqual(q.ranglar, ["to'q ko'k"]);
  assert.equal(q.olcham, "M");
});

test("qimmat emas = arzon", () => {
  assert.equal(parseByKeywords("qimmat emas futbolka").narx_darajasi, "arzon");
});

test("so'z ichidagi bo'lak hisoblanmaydi", () => {
  // "kishi" ichidagi "ish" maqsad emas
  assert.equal(parseByKeywords("bir kishi uchun shim").maqsad, null);
});

test("qizil rang jinsni bildirmaydi", () => {
  assert.equal(parseByKeywords("qizil ko'ylak").jins, null);
  assert.equal(parseByKeywords("qizim uchun ko'ylak").jins, "ayol");
});

test("byudjetdagi raqam o'lcham emas", () => {
  const q = parseByKeywords("futbolka 50 ming");
  assert.equal(q.olcham, null);
  assert.equal(q.narx_max, 50_000);
});

test("byudjet turli yozuvlarda", () => {
  assert.equal(parseByKeywords("300 ming so'mgacha futbolka").narx_max, 300_000);
  assert.equal(parseByKeywords("kostyum 1,5 mln").narx_max, 1_500_000);
  assert.equal(parseByKeywords("250 000 so'mlik ko'ylak").narx_max, 250_000);
  assert.equal(parseByKeywords("рубашка до 300 тыс").narx_max, 300_000);
});

test("o'lcham: kichik harfdagi xl, 2xl, raqam va so'z yonidagi bitta harf", () => {
  assert.equal(parseByKeywords("xl futbolka").olcham, "XL");
  assert.equal(parseByKeywords("qizil libos 2xl").olcham, "XXL");
  assert.equal(parseByKeywords("300 ming so'mgacha erkaklar futbolkasi, XL").olcham, "XL");
  assert.equal(parseByKeywords("до 300 тыс рубашка 48 размер").olcham, "48");
  assert.equal(parseByKeywords("m o'lchamli ko'ylak").olcham, "M");
  // Oddiy so'zdagi "m" o'lcham emas
  assert.equal(parseByKeywords("menga ko'ylak kerak").olcham, null);
});
