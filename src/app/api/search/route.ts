import { z } from "zod";
import { understandQuery } from "@/lib/query";
import { EMPTY_QUERY, type ParsedQuery } from "@/lib/query/schema";
import { loadVocabulary, runSearch } from "@/lib/search";

const bodySchema = z.union([
  z.object({ text: z.string().trim().min(1).max(500) }),
  z.object({
    filters: z.object({
      kategoriya: z.string().nullable().optional(),
      jins: z.enum(["erkak", "ayol"]).nullable().optional(),
      rang: z.string().nullable().optional(),
      narx_darajasi: z.enum(["arzon", "orta", "qimmat"]).nullable().optional(),
    }),
  }),
]);

export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "So'rov noto'g'ri" }, { status: 400 });
  }

  if ("text" in body.data) {
    const text = body.data.text;
    const { parsed, mode, llmError } = await understandQuery(text, await loadVocabulary());
    return Response.json(await runSearch(text, parsed, mode, llmError));
  }

  // Filtr tugmalari: LLM'siz, to'g'ridan-to'g'ri tartibli so'rov
  const f = body.data.filters;
  const parsed: ParsedQuery = {
    ...EMPTY_QUERY,
    kategoriya: f.kategoriya ?? null,
    jins: f.jins ?? null,
    ranglar: f.rang ? [f.rang] : [],
    narx_darajasi: f.narx_darajasi ?? null,
  };
  const label = [parsed.kategoriya, parsed.jins, f.rang, parsed.narx_darajasi].filter(Boolean).join(", ");
  parsed.izoh = `Filtr: ${label || "hammasi"}`;
  return Response.json(await runSearch(parsed.izoh, parsed, "filtr"));
}
