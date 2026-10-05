import { CSV_COLUMNS } from "@/lib/csv";
import { ImportForm } from "@/components/admin/ImportForm";

export default function ImportPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">CSV import</h1>
        <p className="mt-1 text-sm text-neutral-600">
          SKU bo&apos;yicha mavjud tovar yangilanadi, yangi SKU qo&apos;shiladi. Xato qatorlar o&apos;tkazib yuboriladi va
          pastda ko&apos;rsatiladi.
        </p>
      </div>

      <ImportForm />

      <div className="space-y-2 text-sm text-neutral-600">
        <div className="font-medium text-neutral-800">Fayl formati</div>
        <p>
          Ustunlar: <code className="rounded bg-neutral-100 px-1">{CSV_COLUMNS.join(", ")}</code>
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><code>gender</code>: erkak, ayol yoki unisex</li>
          <li><code>season</code>: hamma, yoz, bahor-kuz yoki qish</li>
          <li><code>style_tags</code>: <code>ish|klassik</code> ko&apos;rinishida</li>
          <li><code>sizes</code>: <code>S:3|M:5|L:0</code> (o&apos;lcham:qoldiq)</li>
        </ul>
        <p>
          Namuna sifatida joriy omborni yuklab oling:{" "}
          <a href="/admin/export" className="underline">si-stilist-tovarlar.csv</a>
        </p>
      </div>
    </div>
  );
}
