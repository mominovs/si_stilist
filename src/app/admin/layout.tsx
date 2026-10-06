import Link from "next/link";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4 text-sm">
          <Link href="/" className="text-base font-semibold">
            SI Stilist <span className="font-normal text-neutral-400">/ admin</span>
          </Link>
          <Link href="/admin" className="text-neutral-600 hover:text-neutral-900">Tovarlar</Link>
          <Link href="/admin/products/new" className="text-neutral-600 hover:text-neutral-900">Yangi tovar</Link>
          <Link href="/admin/import" className="text-neutral-600 hover:text-neutral-900">CSV import</Link>
          <Link href="/admin/holat" className="text-neutral-600 hover:text-neutral-900">Demo holati</Link>
          <Link href="/panel" className="ml-auto text-neutral-600 hover:text-neutral-900">Do&apos;kon paneli</Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
