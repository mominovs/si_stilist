import Link from "next/link";
import type { ReactNode } from "react";
import { Logo, LogoMark } from "./Logo";

type Section = "stilist" | "oyna" | "panel" | "admin";

const NAV: { key: Section; href: string; label: string }[] = [
  { key: "stilist", href: "/", label: "Stilist" },
  { key: "oyna", href: "/oyna", label: "Jonli oyna" },
  { key: "panel", href: "/panel", label: "Do'kon paneli" },
];

/** Umumiy sarlavha: logo, holat belgisi (masalan "SI tayyor") va bo'limlar; joriy bo'lim to'q "tabletka" */
export function SiteHeader({ active, status, extra }: { active?: Section; status?: ReactNode; extra?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/" prefetch={false} aria-label="SI Stilist: bosh sahifa" className="flex items-center">
          <span className="sm:hidden">
            <LogoMark size={36} />
          </span>
          <span className="hidden sm:inline-flex">
            <Logo size={40} />
          </span>
        </Link>
        {status && <div className="hidden sm:block">{status}</div>}
        <nav className="ml-auto flex items-center gap-0.5 overflow-x-auto sm:gap-1">
          {extra}
          {NAV.map((n) => (
            <Link
              key={n.key}
              href={n.href}
              prefetch={false}
              className={`whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-bold sm:px-4 ${
                n.key === active ? "bg-brand text-white" : "text-ink hover:bg-brand-soft"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

/** Holat belgisi: yashil "SI tayyor", sariq "Zaxira rejim", kulrang */
export function StatusPill({ tone, children, title }: { tone: "ok" | "warn" | "off"; children: ReactNode; title?: string }) {
  const cls = tone === "ok" ? "badge-ok" : tone === "warn" ? "badge-warn" : "bg-surface-2 text-muted";
  const dot = tone === "ok" ? "bg-success-dot" : tone === "warn" ? "bg-warning-dot" : "bg-muted";
  return (
    <span title={title} className={`badge ${cls}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {children}
    </span>
  );
}
