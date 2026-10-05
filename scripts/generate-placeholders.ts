// Seed tovarlari uchun oq fondagi vaqtinchalik SVG rasmlar yaratadi: public/products/<sku>.svg
// Haqiqiy suratlar kelganda shu fayllar almashtiriladi (yoki admin orqali rasm manzili o'zgartiriladi).
// Ishga tushirish: npm run images:placeholders

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { colorHex } from "../src/lib/catalog";
import { seedProducts } from "../prisma/seed-data/products";

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amount < 0 ? c : 255 - c) * amount)));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// Har kategoriya uchun asosiy shakl (viewBox 0 0 400 500) va qo'shimcha detallar
function garment(category: string, fill: string, line: string, accent: string): string {
  const body = (d: string) =>
    `<path d="${d}" fill="${fill}" stroke="${line}" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="url(#shade)"/>`;
  const stroke = (d: string, w = 3) =>
    `<path d="${d}" fill="none" stroke="${line}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

  switch (category) {
    case "futbolka":
      return (
        body("M140 70 L105 82 L48 132 L85 188 L122 162 L122 432 L278 432 L278 162 L315 188 L352 132 L295 82 L260 70 Q200 112 140 70 Z") +
        stroke("M148 74 Q200 120 252 74")
      );
    case "ko'ylak":
      return (
        body("M140 70 L105 82 L62 140 L42 332 L82 338 L106 192 L116 182 L116 442 L284 442 L284 182 L294 192 L318 338 L358 332 L338 140 L295 82 L260 70 L200 96 Z") +
        `<path d="M140 70 L200 96 L172 128 Z M260 70 L200 96 L228 128 Z" fill="${accent}" stroke="${line}" stroke-width="3" stroke-linejoin="round"/>` +
        stroke("M200 96 L200 442", 2) +
        [150, 200, 250, 300, 350, 400].map((y) => `<circle cx="210" cy="${y}" r="4" fill="${line}"/>`).join("") +
        stroke("M44 318 L82 323 M318 323 L356 318", 2)
      );
    case "sviter":
      return (
        body("M145 70 L105 82 L62 140 L44 342 L84 347 L108 196 L118 186 L118 446 L282 446 L282 186 L292 196 L316 347 L356 342 L338 140 L295 82 L255 70 Q200 102 145 70 Z") +
        stroke("M152 74 Q200 112 248 74", 6) +
        stroke("M118 420 L282 420 M47 318 L86 323 M314 323 L353 318", 2) +
        [140, 160, 180, 200, 220, 240, 260].map((x) => stroke(`M${x} 422 L${x} 444`, 1.5)).join("")
      );
    case "kurtka":
      return (
        body("M145 72 L105 84 L60 142 L40 340 L82 346 L108 198 L116 188 L116 440 L284 440 L284 188 L292 198 L318 346 L360 340 L340 142 L295 84 L255 72 Q200 98 145 72 Z") +
        `<path d="M145 72 L150 46 L250 46 L255 72 Q200 98 145 72 Z" fill="${accent}" stroke="${line}" stroke-width="3" stroke-linejoin="round"/>` +
        stroke("M200 86 L200 440", 3) +
        stroke("M138 300 L178 300 M222 300 L262 300", 3) +
        stroke("M116 418 L284 418 M43 316 L84 322 M316 322 L357 316", 2)
      );
    case "kostyum":
      return (
        body("M148 70 L105 84 L60 142 L40 340 L82 346 L108 198 L116 188 L116 444 L284 444 L284 188 L292 198 L318 346 L360 340 L340 142 L295 84 L252 70 L200 120 Z") +
        `<path d="M160 72 L200 120 L240 72 L200 222 Z" fill="#f7f7f5" stroke="${line}" stroke-width="2"/>` +
        `<path d="M193 124 L207 124 L212 200 L200 216 L188 200 Z" fill="${shade(fill, -0.35)}"/>` +
        `<path d="M148 70 L200 222 L176 160 L150 126 L170 112 Z M252 70 L200 222 L224 160 L250 126 L230 112 Z" fill="${accent}" stroke="${line}" stroke-width="3" stroke-linejoin="round"/>` +
        stroke("M200 222 L200 444", 2) +
        `<circle cx="210" cy="262" r="5" fill="${line}"/><circle cx="210" cy="312" r="5" fill="${line}"/>` +
        stroke("M136 330 L176 330 M224 330 L264 330 M232 180 L262 176", 3)
      );
    case "shim":
      return (
        body("M128 60 L272 60 L288 452 L214 452 L200 168 L186 452 L112 452 Z") +
        `<rect x="128" y="60" width="144" height="24" fill="${accent}" stroke="${line}" stroke-width="3"/>` +
        stroke("M200 84 L200 168 M150 84 Q150 120 128 128 M250 84 Q250 120 272 128", 2) +
        [150, 200, 250].map((x) => `<rect x="${x - 4}" y="58" width="8" height="28" fill="${line}" opacity="0.5"/>`).join("")
      );
    case "yubka":
      return (
        body("M142 110 L258 110 L304 410 L96 410 Z") +
        `<rect x="138" y="88" width="124" height="24" rx="3" fill="${accent}" stroke="${line}" stroke-width="3"/>` +
        stroke("M170 112 L150 410 M200 112 L200 410 M230 112 L250 410", 1.5)
      );
    case "libos":
      return (
        body("M162 62 L180 62 Q200 86 220 62 L238 62 L248 152 Q236 186 242 212 L322 452 L78 452 L158 212 Q164 186 152 152 Z") +
        `<path d="M156 206 Q200 220 244 206 L246 222 Q200 236 154 222 Z" fill="${accent}" stroke="${line}" stroke-width="2"/>` +
        stroke("M168 30 L162 62 M232 30 L238 62", 4) +
        stroke("M180 236 L140 450 M220 236 L260 450", 1.5)
      );
    default:
      return body("M120 80 L280 80 L300 440 L100 440 Z");
  }
}

function svgFor(category: string, color: string): string {
  const fill = colorHex(color);
  const isLight = parseInt(fill.slice(1, 3), 16) > 200;
  const line = isLight ? "#a3a3a3" : shade(fill, -0.35);
  const accent = shade(fill, isLight ? -0.06 : 0.12);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="800" height="1000">
<defs>
<linearGradient id="shade" x1="0" x2="1" y1="0" y2="0">
<stop offset="0" stop-color="#fff" stop-opacity="0.16"/>
<stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
<stop offset="1" stop-color="#000" stop-opacity="0.12"/>
</linearGradient>
</defs>
<rect width="400" height="500" fill="#ffffff"/>
<ellipse cx="200" cy="472" rx="130" ry="10" fill="#000" opacity="0.06"/>
${garment(category, fill, line, accent)}
</svg>
`;
}

const outDir = join(process.cwd(), "public", "products");
mkdirSync(outDir, { recursive: true });
for (const p of seedProducts) {
  writeFileSync(join(outDir, `${p.sku.toLowerCase()}.svg`), svgFor(p.category, p.color));
}
console.log(`${seedProducts.length} ta rasm yaratildi: public/products/`);
