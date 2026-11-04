import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { MODEL_TYPES, resolveModelFile } from "@/lib/web-models";

// Telefonda ishlaydigan modellar va onnxruntime-web fayllari: yo'llar va kesh qoidalari src/lib/web-models.ts da

export async function GET(_request: Request, ctx: RouteContext<"/models/[...path]">) {
  const { path: parts } = await ctx.params;
  const target = resolveModelFile(parts);
  if (!target) return new Response("Topilmadi", { status: 404 });
  let size: number;
  try {
    const info = await stat(target.file);
    if (!info.isFile()) throw new Error("fayl emas");
    size = info.size;
  } catch {
    return new Response("Topilmadi", { status: 404 });
  }
  const body = Readable.toWeb(createReadStream(target.file)) as ReadableStream;
  return new Response(body, {
    headers: {
      "Content-Type": MODEL_TYPES[path.extname(target.file).toLowerCase()],
      "Content-Length": String(size),
      "Cache-Control": target.cache,
      // Sinov sahifasi COEP: require-corp bilan ochiladi (ko'p oqimli WASM uchun). onnxruntime oqimlari shu
      // .mjs faylni worker sifatida ochadi: worker skriptida ham COEP bo'lmasa brauzer uni bloklaydi
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  });
}
