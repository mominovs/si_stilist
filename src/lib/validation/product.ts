import { z } from "zod";
import { GENDERS, SEASONS } from "@/lib/catalog";

const lower = z
  .string()
  .trim()
  .min(1, "To'ldirilishi shart")
  .transform((s) => s.toLowerCase());

export const variantSchema = z.object({
  size: z.string().trim().min(1, "O'lcham bo'sh").transform((s) => s.toUpperCase()),
  stock: z.coerce.number({ message: "Qoldiq raqam bo'lsin" }).int("Butun son bo'lsin").min(0, "Manfiy bo'lmasin"),
});

export const productSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .transform((s) => (s === "" ? null : s))
      .nullable()
      .optional(),
    name: z.string().trim().min(2, "Nomi kamida 2 belgi"),
    category: lower,
    gender: z.enum(GENDERS, { message: "Jinsni tanlang" }),
    color: lower,
    styleTags: z.array(lower).default([]),
    season: z.enum(SEASONS, { message: "Mavsumni tanlang" }),
    price: z.coerce.number({ message: "Narx raqam bo'lsin" }).int("Butun son bo'lsin").positive("Narx musbat bo'lsin"),
    imageUrl: z.string().trim().min(1, "Rasm manzili kerak"),
    description: z
      .string()
      .trim()
      .transform((s) => (s === "" ? null : s))
      .nullable()
      .optional(),
    variants: z.array(variantSchema).min(1, "Kamida bitta o'lcham kiriting"),
  })
  .superRefine((p, ctx) => {
    const seen = new Set<string>();
    for (const v of p.variants) {
      if (seen.has(v.size)) {
        ctx.addIssue({ code: "custom", path: ["variants"], message: `"${v.size}" o'lchami takrorlangan` });
      }
      seen.add(v.size);
    }
  });

export type ProductInput = z.infer<typeof productSchema>;
