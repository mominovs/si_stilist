// Tashqi xizmatlar sozlamalari. Faqat serverda o'qiladi: NEXT_PUBLIC_ prefiksi yo'q,
// shuning uchun kalitlar brauzerga chiqmaydi.
export const config = {
  llm: {
    model: process.env.LLM_MODEL || "claude-haiku-4-5-20251001",
    apiKey: process.env.ANTHROPIC_API_KEY || "",
  },
  tryOn: {
    endpoint: process.env.TRYON_ENDPOINT || "fal-ai/kling/v1-5/kolors-virtual-try-on",
    apiKey: process.env.FAL_KEY || "",
  },
  realtime: {
    apiKey: process.env.DECART_API_KEY || "",
    maxSessionSeconds: 60,
  },
} as const;
