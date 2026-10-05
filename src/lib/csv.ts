import Papa from "papaparse";
import { productSchema, type ProductInput } from "@/lib/validation/product";

// CSV ustunlari. style_tags va sizes ichida qiymatlar "|" bilan ajratiladi:
//   style_tags: ish|klassik
//   sizes:      S:3|M:5|L:0   (o'lcham:qoldiq)
export const CSV_COLUMNS = [
  "sku",
  "name",
  "category",
  "gender",
  "color",
  "style_tags",
  "season",
  "price",
  "image_url",
  "description",
  "sizes",
] as const;

export type CsvRowResult =
  | { row: number; ok: true; data: ProductInput }
  | { row: number; ok: false; errors: string[] };

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSizes(value: string | undefined) {
  return splitList(value).map((pair) => {
    const [size, stock] = pair.split(":");
    return { size: size ?? "", stock: stock === undefined ? NaN : Number(stock) };
  });
}

export function parseProductsCsv(text: string): { rows: CsvRowResult[]; missingColumns: string[] } {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const headers = parsed.meta.fields ?? [];
  const required = CSV_COLUMNS.filter((c) => c !== "sku" && c !== "description");
  const missingColumns = required.filter((c) => !headers.includes(c));
  if (missingColumns.length > 0) return { rows: [], missingColumns };

  const rows = parsed.data.map((raw, i): CsvRowResult => {
    // +2: sarlavha qatori va 1 dan sanash
    const row = i + 2;
    const result = productSchema.safeParse({
      sku: raw.sku ?? "",
      name: raw.name,
      category: raw.category,
      gender: raw.gender?.trim().toLowerCase(),
      color: raw.color,
      styleTags: splitList(raw.style_tags),
      season: raw.season?.trim().toLowerCase() || "hamma",
      price: raw.price?.replace(/\s/g, ""),
      imageUrl: raw.image_url,
      description: raw.description ?? "",
      variants: parseSizes(raw.sizes),
    });
    if (result.success) return { row, ok: true, data: result.data };
    return {
      row,
      ok: false,
      errors: result.error.issues.map((iss) => `${iss.path.join(".") || "qator"}: ${iss.message}`),
    };
  });

  return { rows, missingColumns: [] };
}

export function productsToCsv(
  products: Array<{
    sku: string | null;
    name: string;
    category: string;
    gender: string;
    color: string;
    styleTags: string[];
    season: string;
    price: number;
    imageUrl: string;
    description: string | null;
    variants: { size: string; stock: number }[];
  }>,
): string {
  return Papa.unparse({
    fields: [...CSV_COLUMNS],
    data: products.map((p) => [
      p.sku ?? "",
      p.name,
      p.category,
      p.gender,
      p.color,
      p.styleTags.join("|"),
      p.season,
      p.price,
      p.imageUrl,
      p.description ?? "",
      p.variants.map((v) => `${v.size}:${v.stock}`).join("|"),
    ]),
  });
}
