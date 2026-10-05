// Tashqi xizmatlar sozlamalari. Faqat serverda o'qiladi: NEXT_PUBLIC_ prefiksi yo'q,
// shuning uchun kalitlar brauzerga chiqmaydi.
// Getter'lar orqali har safar process.env dan o'qiladi: dev rejimida .env o'zgarsa, server qayta
// ishga tushirilmasa ham yangi qiymat olinadi.
export const config = {
  llm: {
    get model() {
      return process.env.LLM_MODEL || "claude-haiku-4-5-20251001";
    },
    get apiKey() {
      return (process.env.ANTHROPIC_API_KEY || "").trim();
    },
    /** Birinchi urinish uchun kutish vaqti (ms). Sekin tarmoqda .env orqali oshirish mumkin */
    get timeoutMs() {
      const v = Number(process.env.LLM_TIMEOUT_MS);
      return Number.isFinite(v) && v >= 2000 ? v : 12_000;
    },
    /** Bir kunda SI'ga yuboriladigan so'rovlar chegarasi (byudjet himoyasi), keyin oddiy tahlil */
    get dailyLimit() {
      const v = Number(process.env.LLM_DAILY_LIMIT);
      return Number.isFinite(v) && v > 0 ? v : 500;
    },
  },
  tryOn: {
    /** "gemini" | "fal". Ko'rsatilmasa: GEMINI_API_KEY bo'lsa Gemini, aks holda fal */
    get provider(): "gemini" | "fal" {
      const v = (process.env.TRYON_PROVIDER || "").trim().toLowerCase();
      if (v === "gemini" || v === "fal") return v;
      return process.env.GEMINI_API_KEY ? "gemini" : "fal";
    },
    get geminiKey() {
      return (process.env.GEMINI_API_KEY || "").trim();
    },
    get geminiModel() {
      return process.env.TRYON_GEMINI_MODEL || "gemini-3.1-flash-image";
    },
    /** Tanlangan provayder kaliti */
    get activeKey() {
      return this.provider === "gemini" ? this.geminiKey : this.apiKey;
    },
    get providerLabel() {
      return this.provider === "gemini" ? "Google Gemini" : "fal.ai";
    },
    get endpoint() {
      return process.env.TRYON_ENDPOINT || "fal-ai/kling/v1-5/kolors-virtual-try-on";
    },
    get apiKey() {
      return (process.env.FAL_KEY || "").trim();
    },
    /** Shundan uzoq kutilsa demo rejimga o'tiladi (ms) */
    get timeoutMs() {
      const v = Number(process.env.TRYON_TIMEOUT_MS);
      return Number.isFinite(v) && v >= 5000 ? v : 45_000;
    },
    /** Bir kunda API orqali kiyintirishlar chegarasi (har biri pullik), keyin demo rejim */
    get dailyLimit() {
      const v = Number(process.env.TRYON_DAILY_LIMIT);
      return Number.isFinite(v) && v > 0 ? v : 40;
    },
  },
  realtime: {
    get apiKey() {
      return process.env.DECART_API_KEY || "";
    },
    maxSessionSeconds: 60,
  },
};
