import { formatPrice } from "@/lib/format";
import type { ParseMode, ParsedQuery } from "@/lib/query/schema";

const PRICE = { arzon: "arzon", orta: "o'rta narx", qimmat: "qimmat" } as const;

const MODE: Record<ParseMode, { label: string; cls: string }> = {
  llm: { label: "SI tahlil", cls: "badge-brand" },
  kalit: { label: "Oddiy tahlil", cls: "bg-surface-2 text-muted" },
  filtr: { label: "Filtr", cls: "badge-brand" },
  tushunilmadi: { label: "Tushunilmadi", cls: "badge-danger" },
  rad: { label: "Mavzudan tashqari", cls: "bg-surface-2 text-muted" },
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
    q.narx_max ? `${formatPrice(q.narx_max)}gacha` : null,
    q.olcham ? `${q.olcham} o'lcham` : null,
    q.mavsum,
  ].filter((x): x is string => Boolean(x));
}

export function QueryChips({ parsed, mode }: { parsed: ParsedQuery | null; mode: ParseMode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`badge ${MODE[mode].cls}`}>{MODE[mode].label}</span>
      {parsed &&
        queryChips(parsed).map((c) => (
          <span key={c} className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line)]">
            {c}
          </span>
        ))}
    </div>
  );
}
