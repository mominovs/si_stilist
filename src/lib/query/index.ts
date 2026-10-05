import { parseByKeywords } from "./keywords";
import { describeLlmError, llmConfigured, parseWithLlm, type Vocabulary } from "./llm";
import { normalizeQuery } from "./normalize";
import { hasCriteria, type ParseMode, type ParsedQuery } from "./schema";

export type Understanding = {
  parsed: ParsedQuery | null;
  mode: ParseMode;
  /** Kalit sozlangan, lekin SI ishlamagan bo'lsa: sababi (interfeysda ko'rsatiladi) */
  llmError?: string;
};

/**
 * Xaridor matnini tushunish zanjiri:
 *   1) LLM (bir marta qayta urinish bilan)
 *   2) LLM ishlamasa: kalit so'zlar bo'yicha oddiy tahlil
 *   3) u ham hech narsa topmasa: parsed = null, interfeys filtr tugmalarini ochadi
 * Kiyimga oid bo'lmagan so'rovlar (mode "rad") va mezonsiz so'rovlar hech qachon qidiruvga yuborilmaydi.
 */
export async function understandQuery(text: string, vocab: Vocabulary): Promise<Understanding> {
  let llmError: string | undefined;
  if (llmConfigured()) {
    try {
      const { mavzu, ...raw } = await parseWithLlm(text, vocab);
      if (mavzu === "boshqa") return { parsed: null, mode: "rad" };
      const parsed = normalizeQuery(raw, vocab.categories);
      // Kiyimga oid, lekin hech qanday mezon yo'q ("menga kiyim kerak"): tasodifiy tovar ko'rsatilmaydi
      if (!hasCriteria(parsed)) return { parsed: null, mode: "tushunilmadi" };
      return { parsed, mode: "llm" };
    } catch (e) {
      llmError = describeLlmError(e);
      console.warn(`[llm] zaxira rejimga o'tildi (${llmError}):`, e instanceof Error ? e.message : e);
    }
  }

  const parsed = normalizeQuery(parseByKeywords(text), vocab.categories);
  if (hasCriteria(parsed)) return { parsed, mode: "kalit", llmError };
  return { parsed: null, mode: "tushunilmadi", llmError };
}

export type { ParsedQuery, ParseMode } from "./schema";
export type { Vocabulary } from "./llm";
