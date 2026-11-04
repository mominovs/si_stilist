import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { resolveModelFile } from "./web-models";

const base = path.resolve(process.cwd(), "tryon-local", "models", "web");

test("model fayli o'z papkasidan, kesh nomiga qarab", () => {
  const sinov = resolveModelFile(["mirror", "sinov", "model.onnx"]);
  assert.equal(sinov?.file, path.join(base, "mirror", "sinov", "model.onnx"));
  assert.equal(sinov?.cache, "public, max-age=300");
  const v3 = resolveModelFile(["mirror", "v3", "model.fp16.onnx"]);
  assert.equal(v3?.cache, "public, max-age=31536000, immutable");
  assert.ok(resolveModelFile(["mirror", "sinov", "meta.json"]));
  assert.ok(resolveModelFile(["mirror", "sinov", "namuna_odam.png"]));
});

test("onnxruntime fayllari faqat ro'yxatdagilar", () => {
  const ort = resolveModelFile(["ort", "ort.min.js"]);
  assert.ok(ort?.file.endsWith(path.join("onnxruntime-web", "dist", "ort.min.js")));
  assert.ok(resolveModelFile(["ort", "ort-wasm-simd-threaded.jsep.wasm"]));
  assert.equal(resolveModelFile(["ort", "package.json"]), null);
  assert.equal(resolveModelFile(["ort", "ort.node.min.js"]), null);
});

test("papkadan tashqariga chiqib bo'lmaydi va boshqa turdagi fayllar berilmaydi", () => {
  assert.equal(resolveModelFile(["mirror", "..", "..", "dmvton", "mobile_gen.onnx"]), null);
  assert.equal(resolveModelFile(["mirror", "sinov", "..", "..", "x.json"]), null);
  assert.equal(resolveModelFile(["mirror", "a\\..\\..\\b.onnx"]), null);
  assert.equal(resolveModelFile(["mirror", "sinov", "mobile_warp.pt"]), null);
  assert.equal(resolveModelFile(["dmvton", "model.onnx"]), null);
  assert.equal(resolveModelFile([]), null);
  assert.equal(resolveModelFile(["mirror", "", "model.onnx"]), null);
});
