"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { parseProductsCsv } from "@/lib/csv";
import { productSchema, type ProductInput } from "@/lib/validation/product";

export type FormState = {
  message?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  // Xato bo'lganda kiritilgan qiymatlar qaytariladi: React 19 action'dan keyin formani tozalaydi
  values?: Omit<ReturnType<typeof readProductForm>, "variants">;
  submittedAt?: number;
};

function readProductForm(formData: FormData) {
  let variants: unknown = [];
  try {
    variants = JSON.parse(String(formData.get("variants") ?? "[]"));
  } catch {
    variants = [];
  }
  return {
    sku: String(formData.get("sku") ?? ""),
    name: String(formData.get("name") ?? ""),
    category: String(formData.get("category") ?? ""),
    gender: String(formData.get("gender") ?? ""),
    color: String(formData.get("color") ?? ""),
    styleTags: formData.getAll("styleTags").map(String),
    season: String(formData.get("season") ?? ""),
    price: String(formData.get("price") ?? "").replace(/\s/g, ""),
    imageUrl: String(formData.get("imageUrl") ?? ""),
    description: String(formData.get("description") ?? ""),
    storeId: String(formData.get("storeId") ?? ""),
    variants,
  };
}

function productData(p: ProductInput) {
  return {
    sku: p.sku ?? null,
    name: p.name,
    category: p.category,
    gender: p.gender,
    color: p.color,
    styleTags: p.styleTags,
    season: p.season,
    price: p.price,
    imageUrl: p.imageUrl,
    description: p.description ?? null,
    storeId: p.storeId ?? null,
  };
}

function isUniqueError(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

function errorState(
  raw: ReturnType<typeof readProductForm>,
  message: string,
  fieldErrors: Record<string, string[]>,
): FormState {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { variants, ...values } = raw;
  return { message, fieldErrors, values, submittedAt: Date.now() };
}

function zodFieldErrors(error: import("zod").ZodError) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

async function saveProduct(id: number | null, data: ProductInput) {
  if (id === null) {
    await prisma.product.create({
      data: { ...productData(data), variants: { create: data.variants } },
    });
    return;
  }
  // O'lchamlar to'liq almashtiriladi: ularga boshqa jadvallar bog'lanmagan
  await prisma.$transaction([
    prisma.productVariant.deleteMany({ where: { productId: id } }),
    prisma.product.update({
      where: { id },
      data: { ...productData(data), variants: { create: data.variants } },
    }),
  ]);
}

export async function saveProductAction(
  id: number | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const raw = readProductForm(formData);
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return errorState(raw, "Formada xatolar bor", zodFieldErrors(parsed.error));

  try {
    await saveProduct(id, parsed.data);
  } catch (e) {
    if (isUniqueError(e)) return errorState(raw, "Bu SKU allaqachon bor", { sku: ["Takrorlanmas bo'lsin"] });
    throw e;
  }

  revalidatePath("/admin");
  redirect(`/admin?saved=${encodeURIComponent(parsed.data.name)}`);
}

export async function deleteProductAction(id: number) {
  await requireAdmin();
  if (!Number.isInteger(id) || id <= 0) throw new Error("Noto'g'ri tovar");
  await prisma.product.delete({ where: { id } });
  revalidatePath("/admin");
}

export type ImportState = {
  done?: boolean;
  created?: number;
  updated?: number;
  message?: string;
  rowErrors?: { row: number; errors: string[] }[];
};

const MAX_CSV_BYTES = 2 * 1024 * 1024;

export async function importCsvAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "CSV faylni tanlang" };
  if (file.size > MAX_CSV_BYTES) return { message: "Fayl 2 MB dan katta" };

  const { rows, missingColumns } = parseProductsCsv(await file.text());
  if (missingColumns.length > 0) {
    return { message: `Ustunlar yetishmayapti: ${missingColumns.join(", ")}` };
  }

  let created = 0;
  let updated = 0;
  const rowErrors: { row: number; errors: string[] }[] = [];

  // Xato qatorlar o'tkazib yuboriladi, to'g'rilari import qilinadi.
  // SKU bo'yicha mavjud tovar yangilanadi, SKU bo'lmasa yangi tovar qo'shiladi.
  // "store" ustuni do'kon slug'i (masalan, koton); bo'sh bo'lsa tovar do'konsiz qoladi
  const stores = new Map((await prisma.store.findMany({ select: { id: true, slug: true } })).map((s) => [s.slug, s.id]));
  for (const r of rows) {
    if (!r.ok) {
      rowErrors.push({ row: r.row, errors: r.errors });
      continue;
    }
    if (r.store && !stores.has(r.store)) {
      rowErrors.push({ row: r.row, errors: [`store: "${r.store}" do'koni topilmadi`] });
      continue;
    }
    r.data.storeId = r.store ? stores.get(r.store) : null;
    const existing = r.data.sku
      ? await prisma.product.findUnique({ where: { sku: r.data.sku }, select: { id: true } })
      : null;
    try {
      await saveProduct(existing?.id ?? null, r.data);
      if (existing) updated++;
      else created++;
    } catch (e) {
      rowErrors.push({ row: r.row, errors: [e instanceof Error ? e.message : "Saqlashda xato"] });
    }
  }

  revalidatePath("/admin");
  return { done: true, created, updated, rowErrors };
}
