import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";

const NAV = [
  { href: "/admin", label: "Tovarlar" },
  { href: "/admin/products/new", label: "Yangi tovar" },
  { href: "/admin/import", label: "CSV import" },
  { href: "/admin/holat", label: "Demo holati" },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-1 gap-y-2 px-4 py-3 text-sm sm:px-6">
          <Link href="/" className="mr-4 flex items-center gap-2.5">
            <LogoMark size={34} />
            <span className="font-display text-lg font-extrabold text-brand">
              Admin
            </span>
          </Link>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-full px-3 py-2 font-bold text-ink hover:bg-brand-soft">
              {n.label}
            </Link>
          ))}
          <span className="ml-auto flex gap-1">
            <Link href="/" className="rounded-full px-3 py-2 font-bold text-muted hover:bg-brand-soft">
              Stilist
            </Link>
            <Link href="/panel" className="rounded-full bg-brand px-4 py-2 font-bold text-white hover:bg-brand/90">
              Do&apos;kon paneli
            </Link>
          </span>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
