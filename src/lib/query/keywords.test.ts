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
