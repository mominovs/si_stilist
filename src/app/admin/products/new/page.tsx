import { connection } from "next/server";
import { saveProductAction } from "@/app/admin/actions";
import { formOptions } from "@/app/admin/options";
import { ProductForm } from "@/components/admin/ProductForm";

export default async function NewProductPage() {
  await connection();
  const options = await formOptions();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Yangi tovar</h1>
      <ProductForm action={saveProductAction.bind(null, null)} {...options} />
    </div>
  );
}
