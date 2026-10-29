import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { GENDER_LABELS, colorHex } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { DeleteButton } from "@/components/admin/DeleteButton";

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const category = typeof sp.category === "string" ? sp.category : "";
  const saved = typeof sp.saved === "string" ? sp.saved : "";

  const where: Prisma.ProductWhereInput = {
    ...(category ? { category } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
            { color: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ category: "asc" }, { price: "asc" }],
      include: { variants: { orderBy: { id: "asc" } }, store: { select: { name: true, city: true } } },
    }),
    prisma.product.groupBy({ by: ["category"], _count: true, orderBy: { category: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      {saved && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          &quot;{saved}&quot; saqlandi
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tovarlar</h1>
          <p className="text-sm text-muted">{products.length} ta tovar ko&apos;rsatilmoqda</p>
        </div>
        <div className="flex gap-2">
          <a href="/admin/export" className="rounded-xl border border-line bg-surface px-4 py-2 text-sm hover:bg-brand-soft">
            CSV yuklab olish
          </a>
          <Link href="/admin/products/new" className="rounded-xl bg-brand px-4 py-2 text-sm text-white hover:bg-brand/90">
            + Yangi tovar
          </Link>
        </div>
      </div>

      <form className="flex flex-wrap gap-2" action="/admin">
        <input
          name="q"
          defaultValue={q}
          placeholder="Nomi, SKU yoki rang bo'yicha qidirish"
          className="w-72 rounded-xl border border-line bg-surface px-3 py-2 text-sm"
        />
        <select name="category" defaultValue={category} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          <option value="">Barcha kategoriyalar</option>
          {categories.map((c) => (
            <option key={c.category} value={c.category}>
              {c.category} ({c._count})
            </option>
          ))}
        </select>
        <button className="rounded-xl border border-line bg-surface px-4 py-2 text-sm hover:bg-brand-soft">Qidirish</button>
        {(q || category) && (
          <Link href="/admin" className="px-2 py-2 text-sm text-muted hover:underline">Tozalash</Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Tovar</th>
              <th className="px-4 py-3">Kategoriya</th>
              <th className="px-4 py-3">Jins</th>
              <th className="px-4 py-3">Rang</th>
              <th className="px-4 py-3">Uslub</th>
              <th className="px-4 py-3 text-right">Narx</th>
              <th className="px-4 py-3">O&apos;lchamlar (qoldiq)</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {products.map((p) => {
              const total = p.variants.reduce((s, v) => s + v.stock, 0);
              return (
                <tr key={p.id} className={total === 0 ? "bg-danger-soft/40" : undefined}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.imageUrl} alt="" className="h-14 w-11 rounded border border-line bg-surface object-contain" />
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted">
                          {p.sku ?? `#${p.id}`}
                          {p.store && ` · ${p.store.name}, ${p.store.city}`}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{p.category}</td>
                  <td className="px-4 py-3">{GENDER_LABELS[p.gender]}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full border border-line" style={{ background: colorHex(p.color) }} />
                      {p.color}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{p.styleTags.join(", ")}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{formatPrice(p.price)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {p.variants.map((v) => (
                        <span
                          key={v.id}
                          className={`rounded px-1.5 py-0.5 text-xs ${v.stock > 0 ? "bg-surface-2 text-ink" : "bg-danger-soft text-danger line-through"}`}
                        >
                          {v.size}:{v.stock}
                        </span>
                      ))}
                    </div>
                    {total === 0 && <div className="mt-1 text-xs font-medium text-danger">Omborda yo&apos;q</div>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link href={`/admin/products/${p.id}`} className="mr-3 hover:underline">Tahrirlash</Link>
                    <DeleteButton id={p.id} name={p.name} />
                  </td>
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted">Tovar topilmadi</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
