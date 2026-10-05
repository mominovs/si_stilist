import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "@/lib/config";
import { parsedQuerySchema, type ParsedQuery } from "./schema";

export type Vocabulary = {
  categories: string[];
  colors: string[];
  styleTags: string[];
  seasons: string[];
};

// LLM faqat so'rovni tushunadi: tovar tanlamaydi, omborni ko'rmaydi.
function systemPrompt(v: Vocabulary): string {
  return `Siz kiyim do'konidagi xaridor so'rovini tartibli JSON'ga aylantiruvchi tahlilchisiz.
So'rov o'zbekcha (lotin yoki kirill) yoki ruscha bo'lishi mumkin. Siz tovar tanlamaysiz, faqat so'rovni tushunasiz.

Do'kon lug'ati:
- kategoriyalar: ${v.categories.join(", ")}
- ranglar: ${v.colors.join(", ")}
- uslub va maqsad teglari: ${v.styleTags.join(", ")}
- mavsumlar: ${v.seasons.join(", ")}

Qoidalar:
- kategoriya: lug'atdagi qiymatga moslang (рубашка/блузка -> ko'ylak, платье/сарафан -> libos, брюки/джинсы -> shim,
  пуховик/тренч -> kurtka, худи/кардиган -> sviter). Agar so'ralgan narsa lug'atda bo'lmasa, uni baribir
  o'zbekcha, lotinda, kichik harfda, birlik shaklda yozing (masalan: krossovka, palto, sumka). Hech qachon tashlab ketmang.
  Kategoriya aytilmagan bo'lsa null.
- ranglar: xaridor xohlagan ranglar, lug'atdagi nomlar bilan (тёмно-синий/navy -> to'q ko'k, havorang/голубой -> ko'k).
- rang_istisno: xohlamagan ranglar ("qora rangsiz", "qora bo'lmasin", "не чёрный", "qoradan boshqa").
- maqsad: qayerga kiyiladi, iloji bo'lsa teglardan biri (ish, kundalik, bayram, sport). To'y, kechki ziyofat -> bayram; ofis -> ish.
- uslub: uslub teglari (masalan klassik, zamonaviy). Maqsadni bu yerga takrorlamang.
- narx_darajasi: arzon (arzon, qimmat emas, недорогой), orta (o'rtacha), qimmat (qimmat, premium). Aytilmasa null.
- jins: erkak yoki ayol, faqat aniq bo'lsa (erim uchun -> erkak, qizim uchun -> ayol). Aks holda null.
- olcham: aytilgan o'lcham katta harfda (M, XL, 48, 42). Aks holda null.
- mavsum: yoz, qish yoki bahor-kuz (bahor va kuz -> bahor-kuz). Aytilmasa null.
- izoh: xaridor nimani xohlayotganini bitta qisqa o'zbekcha gapda yozing.
- Faqat matnda aytilgan narsalarni yozing, taxmin qilmang.

Misollar:
"Ishga kiyadigan, qora rangsiz, o'rtacha narxdagi kostyum kerak" ->
{"kategoriya":"kostyum","jins":null,"ranglar":[],"rang_istisno":["qora"],"uslub":[],"maqsad":"ish","narx_darajasi":"orta","olcham":null,"mavsum":null,"izoh":"Ish uchun, qora bo'lmagan, o'rtacha narxdagi kostyum"}
"Нужны белые кроссовки 42 размера" ->
{"kategoriya":"krossovka","jins":null,"ranglar":["oq"],"rang_istisno":[],"uslub":[],"maqsad":null,"narx_darajasi":null,"olcham":"42","mavsum":null,"izoh":"42 o'lchamli oq krossovka"}`;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  // Har bir urinish uchun 8 soniya: demo paytida uzoq kutib qolmaslik uchun.
  // SDK o'zi qayta urinmaydi, qayta urinishni pastdagi kod boshqaradi.
  client ??= new Anthropic({ apiKey: config.llm.apiKey, timeout: 8_000, maxRetries: 0 });
  return client;
}

export function llmConfigured(): boolean {
  return config.llm.apiKey.length > 0;
}

async function parseOnce(text: string, vocab: Vocabulary): Promise<ParsedQuery> {
  const response = await getClient().messages.parse({
    model: config.llm.model,
    max_tokens: 1024,
    system: systemPrompt(vocab),
    messages: [{ role: "user", content: text }],
    output_config: { format: zodOutputFormat(parsedQuerySchema) },
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`LLM javobi yaroqsiz (stop_reason: ${response.stop_reason})`);
  }
  // Qo'shimcha himoya: sxema bo'yicha yana bir bor tekshiriladi
  return parsedQuerySchema.parse(response.parsed_output);
}

/** Bir marta qayta urinadi. Ikkala urinish ham muvaffaqiyatsiz bo'lsa xato tashlaydi. */
export async function parseWithLlm(text: string, vocab: Vocabulary): Promise<ParsedQuery> {
  try {
    return await parseOnce(text, vocab);
  } catch (first) {
    console.warn("[llm] 1-urinish muvaffaqiyatsiz:", first instanceof Error ? first.message : first);
    return await parseOnce(text, vocab);
  }
}
