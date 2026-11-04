import path from "node:path";

// Telefonda ishlaydigan modellar va ularni ishga tushiradigan onnxruntime-web fayllari (/models/... route'i).
//   /models/mirror/<nom>/model.onnx      -> tryon-local/models/web/mirror/<nom>/ (export_onnx.py yaratadi)
//   /models/ort/ort.min.js va .wasm      -> node_modules/onnxruntime-web/dist (CDN'siz, internetsiz ham ishlaydi)
// public/ papkasi o'rniga: u yerdagi fayllar keshlanmaydi (max-age=0) va build'dan keyin qo'shilganlari
// berilmaydi. Bu yerda Cloudflare va brauzer keshlaydi: 37 MB model uy internetidan har safar yuklanmaydi.

const ROOT = process.cwd();
const ORT_DIR = path.join(ROOT, "node_modules", "onnxruntime-web", "dist");
const modelsDir = () => path.resolve(process.env.WEB_MODELS_DIR ?? path.join(ROOT, "tryon-local", "models", "web"));
const ORT_FILES = new Set([
  "ort.min.js",
  "ort.webgpu.min.js",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
]);
export const MODEL_TYPES: Record<string, string> = {
  ".onnx": "application/octet-stream",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
};
// Nomi versiyali papkalar (v1, v2, ...) hech qachon o'zgarmaydi: bir yil keshlanadi. "sinov" va boshqalar qayta
// eksport qilinishi mumkin: 5 daqiqa. onnxruntime fayllari kutubxona versiyasi bilan almashadi: 1 kun
const VERSIONED = /^mirror\/v\d+\//;

/** URL qismlari -> diskdagi fayl (faqat ruxsat etilgan papkalar ichida) yoki null */
export function resolveModelFile(parts: string[]): { file: string; cache: string } | null {
  if (parts.length === 0 || parts.some((p) => !p || p === "." || p === ".." || p.includes("\\"))) return null;
  const ext = path.extname(parts.at(-1) ?? "").toLowerCase();
  if (!MODEL_TYPES[ext]) return null;
  if (parts[0] === "ort") {
    if (parts.length !== 2 || !ORT_FILES.has(parts[1])) return null;
    return { file: path.join(ORT_DIR, parts[1]), cache: "public, max-age=86400" };
  }
  if (parts[0] !== "mirror") return null;
  const rel = parts.join("/");
  const base = modelsDir();
  const file = path.resolve(base, ...parts);
  if (!file.startsWith(base + path.sep)) return null;
  const cache = VERSIONED.test(rel) ? "public, max-age=31536000, immutable" : "public, max-age=300";
  return { file, cache };
}

