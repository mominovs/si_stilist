import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { addBenchResult, benchResultSchema, clearBenchResults, listBenchResults, shortDevice } from "./mirror-bench";

const sample = {
  model: "sinov",
  file: "fp16" as const,
  backend: "webgpu" as const,
  threads: 1,
  downloadMs: 1200,
  initMs: 300,
  firstMs: 90,
  avgMs: 40,
  p50Ms: 38,
  runs: 20,
  diff: 0.8,
  gpu: "qualcomm adreno-7xx",
  device: "Android 14; SM-A546E",
};

beforeEach(() => clearBenchResults());

test("natija qo'shiladi, yangisi birinchi, fps hisoblanadi", () => {
  addBenchResult(sample, 1000);
  const second = addBenchResult({ ...sample, backend: "wasm", avgMs: 250 }, 2000);
  const list = listBenchResults();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, second.id);
  assert.equal(list[0].fps, 4);
  assert.equal(list[1].fps, 25);
});

test("ro'yxat 200 ta bilan cheklanadi", () => {
  for (let i = 0; i < 205; i++) addBenchResult(sample);
  assert.equal(listBenchResults().length, 200);
});

test("sxema noto'g'ri qiymatlarni rad etadi", () => {
  assert.ok(benchResultSchema.safeParse(sample).success);
  assert.ok(!benchResultSchema.safeParse({ ...sample, model: "../x" }).success);
  assert.ok(!benchResultSchema.safeParse({ ...sample, backend: "cuda" }).success);
  assert.ok(!benchResultSchema.safeParse({ ...sample, avgMs: -1 }).success);
  assert.ok(!benchResultSchema.safeParse({ ...sample, device: "x".repeat(300) }).success);
});

test("shortDevice: telefon modeli brauzer qatoridan", () => {
  assert.equal(
    shortDevice("Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007) AppleWebKit/537.36 Chrome/130 Mobile"),
    "Android 14; SM-A546E",
  );
  assert.equal(shortDevice("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36"), "Android 10");
  assert.equal(
    shortDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile"),
    "iPhone; iOS 18.1",
  );
  assert.equal(shortDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130"), "Windows");
});
