// SI (Claude API) ulanishini tekshirish: kalit, tarmoq tezligi va haqiqiy so'rovlar vaqti.
// Ishga tushirish: npm run check:ai

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES, COLORS, STYLE_TAGS } from "../src/lib/catalog";
import { config } from "../src/lib/config";
import { describeLlmError, parseOnce } from "../src/lib/query/llm";

const vocab = {
  categories: [...CATEGORIES],
  colors: Object.keys(COLORS),
  styleTags: [...STYLE_TAGS],
  seasons: ["yoz", "bahor-kuz", "qish"],
};

async function timed<T>(label: string, fn: () => Promise<T>): Promise<number | null> {
  const t0 = Date.now();
  try {
    await fn();
    const ms = Date.now() - t0;
    console.log(`  OK   ${label}: ${ms} ms`);
    return ms;
  } catch (e) {
    console.log(`  XATO ${label}: ${Date.now() - t0} ms -> ${describeLlmError(e)}`);
    if (e instanceof Error) console.log(`       ${e.message.slice(0, 200)}`);
    return null;
  }
}

async function main() {
  const key = config.llm.apiKey;
  console.log("1) Sozlamalar");
  if (!key) {
    console.log("  .env faylida ANTHROPIC_API_KEY topilmadi. Fayl nomi aynan .env ekanini tekshiring (.env.txt emas).");
    process.exit(1);
  }
  console.log(`  kalit: ${key.slice(0, 10)}...${key.slice(-4)} (${key.length} belgi)`);
  console.log(`  model: ${config.llm.model}`);
  console.log(`  ilovadagi kutish vaqti: ${config.llm.timeoutMs} ms (LLM_TIMEOUT_MS)`);

  console.log("\n2) Tarmoq va kalit (bepul so'rov)");
  const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 30_000 });
  await timed("modellar ro'yxati", () => client.models.list({ limit: 1 }));

  console.log("\n3) Haqiqiy tahlil so'rovlari (30 s gacha kutiladi)");
  const times: number[] = [];
  for (const text of ["oq kurtka kerak", "bayramga qora ko'ylak", "arzon sport shim"]) {
    const ms = await timed(`"${text}"`, () => parseOnce(text, vocab, 30_000));
    if (ms !== null) times.push(ms);
  }

  console.log("\nXulosa");
  if (times.length === 0) {
    console.log("  SI javob bermadi. Yuqoridagi XATO sababiga qarang.");
    return;
  }
  const slowest = Math.max(...times);
  console.log(`  eng sekin javob: ${slowest} ms`);
  if (slowest > config.llm.timeoutMs) {
    const suggested = Math.ceil((slowest * 1.5) / 1000) * 1000;
    console.log(`  Kutish vaqti yetmaydi. .env ga qo'shing: LLM_TIMEOUT_MS=${suggested}`);
  } else {
    console.log("  Kutish vaqti yetarli, SI ilovada ishlashi kerak.");
  }
}

main();
