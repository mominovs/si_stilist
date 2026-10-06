// Do'kon paneli statistikasi: toza, deterministik funksiya (LLM ishtirok etmaydi).

import type { ParsedQuery } from "@/lib/query/schema";

export type RequestStatusName = "qoniqtirildi" | "qisman" | "qoniqtirilmadi";

export type RequestRow = {
  id: number;
  createdAt: Date;
  rawText: string;
  parsed: ParsedQuery | null;
  mode: string;
  status: RequestStatusName;
  resultCount: number;
  /** Xaridor bahosi: "mos" | "mos-emas" | null */
  feedback?: string | null;
  /** Shu so'rovdan nechta tovar sotuvchiga ko'rsatilgan */
  reserved?: number;
};

/**
 * Qoniqtirilmagan talab turi:
 *  - katalogda-yoq: bunday kategoriya do'konda umuman sotilmaydi (krossovka, palto...)
 *  - tugagan: kategoriya bor, lekin so'ralgan shartlarda omborda hech narsa qolmagan
 *  - oxshashi-bor: aynan so'ralgani yo'q, faqat o'xshash variantlar taklif qilingan
 *  - yoqmadi: tovar topildi, lekin xaridor "mos kelmadi" deb baholadi
 */
export type UnmetType = "katalogda-yoq" | "tugagan" | "oxshashi-bor" | "yoqmadi";

export type UnmetItem = {
  key: string;
  label: string;
  category: string | null;
  colors: string[];
  gender: "erkak" | "ayol" | null;
  type: UnmetType;
  count: number;
  lastAt: string;
  sizes: { size: string; count: number }[];
  examples: string[];
};

export type CategoryStat = {
  name: string;
  total: number;
  qoniqtirildi: number;
  qisman: number;
  qoniqtirilmadi: number;
  inCatalog: boolean;
};

export type PanelStats = {
  /**
   * all: kiyimga oid so'rovlar (tushunilmaganlari ham); understood: tushunilganlari, holatlar faqat shulardan.
   * rad: mavzudan tashqari so'rovlar. Tushunilmagan gap ("???") "mos tovar yo'q" deb hisoblanmaydi.
   */
  totals: {
    all: number;
    understood: number;
    qoniqtirildi: number;
    qisman: number;
    qoniqtirilmadi: number;
    tushunilmadi: number;
    rad: number;
  };
  /** Xaridor bahosi va sotuvchiga ko'rsatish: tavsiyadan haqiqiy xaridga o'tish */
  feedback: { mos: number; mosEmas: number; reserved: number; reservedRequests: number };
  modes: Record<string, number>;
  categories: CategoryStat[];
  styles: { name: string; count: number }[];
  colors: { name: string; count: number }[];
  unmet: UnmetItem[];
  recent: {
    id: number;
    createdAt: string;
    rawText: string;
    mode: string;
    status: RequestStatusName;
    parsed: ParsedQuery | null;
    feedback: string | null;
    reserved: number;
  }[];
  lastId: number;
};

const TYPE_SEVERITY: Record<UnmetType, number> = { "katalogda-yoq": 3, tugagan: 2, "oxshashi-bor": 1, yoqmadi: 0 };

const GENDER_LABEL = { erkak: "erkaklar uchun", ayol: "ayollar uchun" } as const;

function topCounts(counts: Map<string, number>, limit: number) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

const bump = (m: Map<string, number>, key: string, by = 1) => m.set(key, (m.get(key) ?? 0) + by);

export function computeStats(
  rows: RequestRow[],
  knownCategories: string[],
  opts: { limit?: number; recent?: number } = {},
): PanelStats {
  const limit = opts.limit ?? 8;
  const known = new Set(knownCategories);
  const totals = { all: 0, understood: 0, qoniqtirildi: 0, qisman: 0, qoniqtirilmadi: 0, tushunilmadi: 0, rad: 0 };
  const feedback = { mos: 0, mosEmas: 0, reserved: 0, reservedRequests: 0 };
  const modes: Record<string, number> = {};
  const categories = new Map<string, CategoryStat>();
  const styles = new Map<string, number>();
  const colors = new Map<string, number>();
  const unmet = new Map<string, UnmetItem & { sizeMap: Map<string, number> }>();

  // Yangi so'rovlar birinchi: misollar va "oxirgi marta" shu tartibdan olinadi
  const sorted = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id);

  for (const r of sorted) {
    modes[r.mode] = (modes[r.mode] ?? 0) + 1;
    if (r.mode === "rad") {
      totals.rad++;
      continue;
    }
    totals.all++;
    const q = r.parsed;
    if (!q) {
      totals.tushunilmadi++;
      continue;
    }
    totals.understood++;
    totals[r.status]++;
    if (r.feedback === "mos") feedback.mos++;
    if (r.feedback === "mos-emas") feedback.mosEmas++;
    if (r.reserved) {
      feedback.reserved += r.reserved;
      feedback.reservedRequests++;
    }

    if (q.kategoriya) {
      const c = categories.get(q.kategoriya) ?? {
        name: q.kategoriya,
        total: 0,
        qoniqtirildi: 0,
        qisman: 0,
        qoniqtirilmadi: 0,
        inCatalog: known.has(q.kategoriya),
      };
      c.total++;
      c[r.status]++;
      categories.set(q.kategoriya, c);
    }

    for (const s of new Set([...q.uslub, ...(q.maqsad ? [q.maqsad] : [])])) bump(styles, s);
    for (const c of new Set(q.ranglar)) bump(colors, c);

    // Topilgan va xaridor rozi bo'lgan (yoki baholamagan) so'rov talab ro'yxatiga tushmaydi
    const disliked = r.status === "qoniqtirildi" && r.feedback === "mos-emas";
    if (r.status === "qoniqtirildi" && !disliked) continue;

    // Talab kaliti: kategoriya + so'ralgan ranglar + jins ("erkaklar uchun oq futbolka", "qizil libos")
    const cols = [...new Set(q.ranglar)].sort();
    const key = `${q.kategoriya ?? "?"}|${cols.join(",")}|${q.jins ?? ""}`;
    const type: UnmetType = disliked
      ? "yoqmadi"
      : r.status === "qisman"
        ? "oxshashi-bor"
        : q.kategoriya && !known.has(q.kategoriya)
          ? "katalogda-yoq"
          : "tugagan";

    let item = unmet.get(key);
    if (!item) {
      const label = [cols.join("/"), q.kategoriya ?? "kategoriyasiz so'rov"].filter(Boolean).join(" ");
      item = {
        key,
        label: q.jins ? `${GENDER_LABEL[q.jins]} ${label}` : label,
        category: q.kategoriya,
        colors: cols,
        gender: q.jins,
        type,
        count: 0,
        lastAt: r.createdAt.toISOString(),
        sizes: [],
        examples: [],
        sizeMap: new Map(),
      };
      unmet.set(key, item);
    }
    item.count++;
    if (TYPE_SEVERITY[type] > TYPE_SEVERITY[item.type]) item.type = type;
    if (q.olcham) bump(item.sizeMap, q.olcham);
    if (item.examples.length < 3 && !item.examples.includes(r.rawText)) item.examples.push(r.rawText);
  }

  const unmetList = [...unmet.values()]
    .sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt))
    .slice(0, 15)
    .map(({ sizeMap, ...rest }) => ({
      ...rest,
      sizes: [...sizeMap.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([size, count]) => ({ size, count })),
    }));

  return {
    totals,
    feedback,
    modes,
    categories: [...categories.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)).slice(0, limit),
    styles: topCounts(styles, limit),
    colors: topCounts(colors, limit),
    unmet: unmetList,
    recent: sorted.slice(0, opts.recent ?? 8).map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      rawText: r.rawText,
      mode: r.mode,
      status: r.status,
      parsed: r.parsed,
      feedback: r.feedback ?? null,
      reserved: r.reserved ?? 0,
    })),
    lastId: rows.reduce((m, r) => Math.max(m, r.id), 0),
  };
}
