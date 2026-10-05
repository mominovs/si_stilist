import { notFound } from "next/navigation";
import { saveProductAction } from "@/app/admin/actions";
import { formOptions } from "@/app/admin/options";
import { ProductForm } from "@/components/admin/ProductForm";
import { prisma } from "@/lib/db";

export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [product, options] = await Promise.all([
    prisma.product.findUnique({ where: { id }, include: { variants: { orderBy: { id: "asc" } } } }),
    formOptions(),
  ]);
  if (!product) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tahrirlash: {product.name}</h1>
      <ProductForm
        action={saveProductAction.bind(null, product.id)}
        initial={{
          sku: product.sku ?? "",
          name: product.name,
          category: product.category,
          gender: product.gender,
          color: product.color,
          styleTags: product.styleTags,
          season: product.season,
          price: product.price,
          imageUrl: product.imageUrl,
          description: product.description ?? "",
          variants: product.variants.map((v) => ({ size: v.size, stock: v.stock })),
        }}
        {...options}
      />
    </div>
  );
}
