import { parseByKeywords } from "./keywords";
import { llmConfigured, parseWithLlm, type Vocabulary } from "./llm";
import { normalizeQuery } from "./normalize";
import { hasCriteria, type ParseMode, type ParsedQuery } from "./schema";

export type Understanding = { parsed: ParsedQuery | null; mode: ParseMode };

/**
 * Xaridor matnini tushunish zanjiri:
 *   1) LLM (bir marta qayta urinish bilan)
 *   2) LLM ishlamasa: kalit so'zlar bo'yicha oddiy tahlil
 *   3) u ham hech narsa topmasa: parsed = null, interfeys filtr tugmalarini ochadi
 */
export async function understandQuery(text: string, vocab: Vocabulary): Promise<Understanding> {
  if (llmConfigured()) {
    try {
      const parsed = normalizeQuery(await parseWithLlm(text, vocab), vocab.categories);
      return { parsed, mode: "llm" };
    } catch (e) {
      console.warn("[llm] zaxira rejimga o'tildi:", e instanceof Error ? e.message : e);
    }
  }

  const parsed = normalizeQuery(parseByKeywords(text), vocab.categories);
  if (hasCriteria(parsed)) return { parsed, mode: "kalit" };
  return { parsed: null, mode: "tushunilmadi" };
}

export type { ParsedQuery, ParseMode } from "./schema";
export type { Vocabulary } from "./llm";
