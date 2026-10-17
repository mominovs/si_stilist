import type { ReactNode } from "react";
import type { CategoryStat, RequestStatusName, UnmetType } from "@/lib/analytics";
import { colorHex } from "@/lib/catalog";

// Holat ranglari (brend tizimi). Hech qachon yolg'iz ishlatilmaydi: doim belgi + yozuv bilan.
export const STATUS = {
  qoniqtirildi: { label: "Qoniqtirildi", icon: "✓", fill: "#2fa866", text: "text-success", badge: "badge-ok" },
  qisman: { label: "Qisman", icon: "≈", fill: "#f2a40f", text: "text-warning", badge: "badge-warn" },
  qoniqtirilmadi: { label: "Qoniqtirilmadi", icon: "✕", fill: "#c23b44", text: "text-accent", badge: "badge-danger" },
} as const satisfies Record<RequestStatusName, unknown>;

export const UNMET_TYPE: Record<UnmetType, { label: string; icon: string }> = {
  "katalogda-yoq": { label: "Do'konda bunday tur yo'q", icon: "✕" },
  tugagan: { label: "Omborda tugagan", icon: "!" },
  "oxshashi-bor": { label: "O'xshashi taklif qilindi", icon: "≈" },
  yoqmadi: { label: "Topildi, lekin yoqmadi", icon: "−" },
};

export function Badge({ icon, label, cls }: { icon?: string; label: string; cls: string }) {
  return (
    <span className={`badge whitespace-nowrap ${cls}`}>
      {icon && <span aria-hidden>{icon}</span>}
      {label}
    </span>
  );
}

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-brand">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm font-medium text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  sub,
  status,
  flash,
  bar,
  compact,
}: {
  label: string;
  value: string;
  sub?: string;
  status?: RequestStatusName;
  flash?: boolean;
  /** Jami: holatlar ulushi uch rangli chiziq bilan */
  bar?: Record<RequestStatusName, number>;
  compact?: boolean;
}) {
  const s = status ? STATUS[status] : null;
  const ring = status === "qoniqtirilmadi" ? "shadow-[inset_0_0_0_2px_var(--color-accent)]" : "shadow-[var(--shadow-soft)]";
  const barTotal = bar ? bar.qoniqtirildi + bar.qisman + bar.qoniqtirilmadi : 0;
  return (
    <div className={`rounded-3xl p-5 transition-colors duration-700 ${flash ? "bg-brand-soft" : "bg-surface"} ${ring}`}>
      <div className="eyebrow flex items-center gap-1.5">
        {s && <span aria-hidden>{s.icon}</span>}
        {label}
      </div>
      <div className={`mt-2 font-display font-extrabold tracking-tight ${compact ? "text-3xl" : "text-4xl"} ${s ? s.text : "text-ink"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-sm font-medium text-muted">{sub}</div>}
      {bar && (
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-line">
          {barTotal > 0 &&
            (Object.keys(STATUS) as RequestStatusName[]).map((k) => (
              <div key={k} style={{ flexGrow: bar[k], background: STATUS[k].fill }} title={`${STATUS[k].label}: ${bar[k]}`} />
            ))}
        </div>
      )}
    </div>
  );
}

/** Kategoriyalar: do'konda bor turlar to'q, yo'qlari qizil; holatlar bo'yicha bo'linish ustiga kelganda */
export function CategoryBars({ items }: { items: CategoryStat[] }) {
  const max = Math.max(1, ...items.map((c) => c.total));
  if (items.length === 0) return <Empty />;
  return (
    <div className="space-y-2.5">
      {items.map((c) => (
        <div key={c.name} className="group relative grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3 text-sm">
          <span className={`truncate font-semibold ${c.inCatalog ? "text-ink" : "text-accent"}`}>{c.name}</span>
          <div className="h-2.5 rounded-full" style={{ width: `${(c.total / max) * 100}%`, background: c.inCatalog ? "var(--color-brand)" : "var(--color-accent)" }} />
          <span className="text-right font-bold tabular-nums text-ink">{c.total}</span>
          <div className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden rounded-xl bg-surface px-3 py-2 text-xs shadow-[var(--shadow-lift)] group-hover:block">
            <div className="mb-1 font-bold">
              {c.name}
              {!c.inCatalog && <span className="text-accent"> · do&apos;konda yo&apos;q</span>}
            </div>
            {(Object.keys(STATUS) as RequestStatusName[]).map((k) => (
              <div key={k} className="flex justify-between gap-4">
                <span>
                  {STATUS[k].icon} {STATUS[k].label}
                </span>
                <span className="tabular-nums">{c[k]}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="pt-1 text-xs font-medium text-muted">Qizil: do&apos;konda yo&apos;q tur</p>
    </div>
  );
}

/** Bitta qatorli kattalik ro'yxati: brend rangida, son yonida yozilgan; ranglar uchun rang namunasi */
export function BarList({ items, swatches = false }: { items: { name: string; count: number }[]; swatches?: boolean }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (items.length === 0) return <Empty />;
  if (swatches) {
    return (
      <ul className="space-y-2.5">
        {items.map((i) => (
          <li key={i.name} className="flex items-center gap-3 text-sm" title={`${i.name}: ${i.count} ta so'rov`}>
            <span className="h-6 w-6 shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--color-line)]" style={{ background: colorHex(i.name) }} />
            <span className="flex-1 font-semibold text-ink">{i.name}</span>
            <span className="font-bold tabular-nums text-ink">{i.count}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="space-y-2.5">
      {items.map((i) => (
        <div key={i.name} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3 text-sm" title={`${i.name}: ${i.count} ta so'rov`}>
          <span className="truncate font-semibold text-ink">{i.name}</span>
          <div className="h-2.5 rounded-full bg-brand" style={{ width: `${(i.count / max) * 100}%` }} />
          <span className="text-right font-bold tabular-nums text-ink">{i.count}</span>
        </div>
      ))}
    </div>
  );
}

export function Empty({ dark = false }: { dark?: boolean }) {
  return <p className={`py-4 text-sm font-medium ${dark ? "text-white/60" : "text-muted"}`}>Hozircha ma&apos;lumot yo&apos;q</p>;
}

export function timeAgo(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "hozirgina";
  if (min < 60) return `${min} daq oldin`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} soat oldin`;
  return `${Math.round(h / 24)} kun oldin`;
}
