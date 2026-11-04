// Saytni internetga ochishdan oldin xavfsizlik tekshiruvi (xato bo'lsa exit 1).
//   node scripts/public-check.mjs           run-all.bat (ngrok)
//   node scripts/public-check.mjs --server  run-server.bat (Cloudflare Tunnel, doimiy server): qat'iyroq
//   node scripts/public-check.mjs --domain  faqat NGROK_DOMAIN ni chiqaradi (bo'sh bo'lishi mumkin)
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

const server = process.argv.includes("--server");

const domain = (process.env.NGROK_DOMAIN ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");

if (process.argv.includes("--domain")) {
  if (domain) console.log(domain);
  process.exit(0);
}

let failed = false;
const password = process.env.ADMIN_PASSWORD ?? "";
if (!password) {
  console.log("XATO: .env da ADMIN_PASSWORD yo'q: panel va admin internetda hammaga ochiq bo'lib qoladi.");
  failed = true;
} else if (password === "demo123" || password.length < (server ? 12 : 8)) {
  console.log(
    `XATO: ADMIN_PASSWORD juda oddiy (namunadagi yoki ${server ? 12 : 8} belgidan qisqa). .env da kuchliroq parol qo'ying.`,
  );
  failed = true;
}

// Taqdimot rejimi (parolsiz admin) internetda hech qachon yoqilmasin. run-server.bat OPEN_ACCESS=0 qiladi,
// u .env dagidan ustun turadi, lekin .env da qolib ketgani haqida ogohlantiramiz
const fileEnv = existsSync(".env") ? parse(readFileSync(".env")) : {};
if (process.env.OPEN_ACCESS === "1") {
  console.log("XATO: OPEN_ACCESS=1: admin va panel parolsiz ochiq. Internetga ochishdan oldin uni o'chiring.");
  failed = true;
} else if (fileEnv.OPEN_ACCESS === "1") {
  console.log("Eslatma: .env da OPEN_ACCESS=1 bor. Bu skript uni o'chirib ishga tushiradi, lekin .env dan ham olib tashlang.");
}

const limit = Number(process.env.LLM_DAILY_LIMIT ?? 500);
if (!process.env.LLM_DAILY_LIMIT || limit > 200) {
  console.log(
    `DIQQAT: SI kunlik limiti ${limit} so'rov. Sayt ochiq bo'lsa begonalar ham API pulini sarflaydi: ` +
      ".env da LLM_DAILY_LIMIT=100 qilish tavsiya etiladi (limit tugasa kalit so'z rejimi ishlaydi).",
  );
}

if (!domain && !server) {
  console.log(
    "Eslatma: NGROK_DOMAIN yo'q, har safar tasodifiy manzil beriladi. Doimiy manzil: dashboard.ngrok.com -> " +
      "Domains -> tekin domen, keyin .env ga NGROK_DOMAIN=sizning-nom.ngrok-free.dev",
  );
}

process.exit(failed ? 1 : 0);
