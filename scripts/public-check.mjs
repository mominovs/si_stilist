// run-all.bat dan oldin: saytni internetga (ngrok) ochish xavfsizmi.
//   node scripts/public-check.mjs           tekshiruv (xato bo'lsa exit 1)
//   node scripts/public-check.mjs --domain  faqat NGROK_DOMAIN ni chiqaradi (bo'sh bo'lishi mumkin)
import "dotenv/config";

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
} else if (password === "demo123" || password.length < 8) {
  console.log("XATO: ADMIN_PASSWORD juda oddiy (namunadagi yoki 8 belgidan qisqa). .env da kuchliroq parol qo'ying.");
  failed = true;
}

const limit = Number(process.env.LLM_DAILY_LIMIT ?? 500);
if (!process.env.LLM_DAILY_LIMIT || limit > 200) {
  console.log(
    `DIQQAT: SI kunlik limiti ${limit} so'rov. Sayt ochiq bo'lsa begonalar ham API pulini sarflaydi: ` +
      ".env da LLM_DAILY_LIMIT=100 qilish tavsiya etiladi (limit tugasa kalit so'z rejimi ishlaydi).",
  );
}

if (!domain) {
  console.log(
    "Eslatma: NGROK_DOMAIN yo'q, har safar tasodifiy manzil beriladi. Doimiy manzil: dashboard.ngrok.com -> " +
      "Domains -> tekin domen, keyin .env ga NGROK_DOMAIN=sizning-nom.ngrok-free.app",
  );
}

process.exit(failed ? 1 : 0);
