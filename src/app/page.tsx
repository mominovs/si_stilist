import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">SI Stilist</h1>
        <p className="mt-3 text-lg text-neutral-600">
          Xaridor o&apos;zbek tilida so&apos;raydi, tizim ombordagi tovarlardan mosini topadi. Do&apos;kon esa
          qaysi tovarlar so&apos;ralib, omborda yo&apos;qligini ko&apos;radi.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-neutral-500">
          <div className="font-medium text-neutral-700">Xaridor ekrani</div>
          <p className="mt-1 text-sm">2-bosqichda qo&apos;shiladi</p>
        </div>
        <Link href="/admin" className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:shadow-md">
          <div className="font-medium">Admin</div>
          <p className="mt-1 text-sm text-neutral-500">Tovarlar, o&apos;lchamlar, CSV import</p>
        </Link>
      </div>
    </main>
  );
}
