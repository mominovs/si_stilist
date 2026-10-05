import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Try-on modellari PNG/JPG kutadi. Kiyim rasmi oq fonda 768x1024 PNG ga keltiriladi.
// Natija xotirada keshlanadi: bir xil tovar uchun qayta-qayta konvertatsiya qilinmaydi.
const cache = new Map<string, Buffer>();
const PUBLIC_DIR = path.join(process.cwd(), "public");

async function readSource(imageUrl: string): Promise<Buffer> {
  if (/^https?:\/\//.test(imageUrl)) {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Kiyim rasmi yuklanmadi: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  // Faqat public/ ichidagi fayllar (../ orqali tashqariga chiqib bo'lmaydi)
  const file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(imageUrl)));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new Error("Rasm manzili noto'g'ri");
  return readFile(file);
}

export async function garmentPng(imageUrl: string): Promise<Buffer> {
  const cached = cache.get(imageUrl);
  if (cached) return cached;
  const png = await sharp(await readSource(imageUrl), { density: 150 })
    .flatten({ background: "#ffffff" })
    .resize(768, 1024, { fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();
  cache.set(imageUrl, png);
  return png;
}
