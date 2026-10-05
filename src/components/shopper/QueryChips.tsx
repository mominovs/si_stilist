import type { ParseMode, ParsedQuery } from "@/lib/query/schema";

const PRICE = { arzon: "arzon", orta: "o'rta narx", qimmat: "qimmat" } as const;

const MODE: Record<ParseMode, { label: string; cls: string }> = {
  llm: { label: "SI tahlil", cls: "bg-violet-100 text-violet-800" },
  kalit: { label: "Oddiy tahlil", cls: "bg-neutral-200 text-neutral-700" },
  filtr: { label: "Filtr", cls: "bg-sky-100 text-sky-800" },
  tushunilmadi: { label: "Tushunilmadi", cls: "bg-red-100 text-red-700" },
};

export function queryChips(q: ParsedQuery): string[] {
  return [
    q.kategoriya,
    q.jins === "erkak" ? "erkaklar uchun" : q.jins === "ayol" ? "ayollar uchun" : null,
    ...q.ranglar,
    ...q.rang_istisno.map((c) => `${c} emas`),
    q.maqsad,
    ...q.uslub.filter((u) => u !== q.maqsad),
    q.narx_darajasi ? PRICE[q.narx_darajasi] : null,
    q.olcham ? `${q.olcham} o'lcham` : null,
    q.mavsum,
  ].filter((x): x is string => Boolean(x));
}

export function QueryChips({ parsed, mode }: { parsed: ParsedQuery | null; mode: ParseMode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${MODE[mode].cls}`}>{MODE[mode].label}</span>
      {parsed &&
        queryChips(parsed).map((c) => (
          <span key={c} className="rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-xs text-neutral-700">
            {c}
          </span>
        ))}
    </div>
  );
}
