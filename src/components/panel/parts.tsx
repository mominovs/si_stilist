import type { ReactNode } from "react";
import type { CategoryStat, RequestStatusName, UnmetType } from "@/lib/analytics";
import { colorHex } from "@/lib/catalog";

// Holat ranglari (dataviz: status palette). Hech qachon yolg'iz ishlatilmaydi: doim belgi + yozuv bilan.
export const STATUS = {
  qoniqtirildi: { label: "Qoniqtirildi", icon: "✓", fill: "#0ca30c", badge: "bg-green-50 text-green-800 ring-green-200" },
  qisman: { label: "Qisman", icon: "≈", fill: "#fab219", badge: "bg-amber-50 text-amber-900 ring-amber-200" },
  qoniqtirilmadi: { label: "Qoniqtirilmadi", icon: "✕", fill: "#d03b3b", badge: "bg-red-50 text-red-800 ring-red-200" },
} as const satisfies Record<RequestStatusName, unknown>;

export const UNMET_TYPE: Record<UnmetType, { label: string; icon: string; badge: string }> = {
  "katalogda-yoq": { label: "Do'konda bunday tur yo'q", icon: "✕", badge: "bg-red-50 text-red-800 ring-red-200" },
  tugagan: { label: "Omborda tugagan", icon: "!", badge: "bg-orange-50 text-orange-800 ring-orange-200" },
  "oxshashi-bor": { label: "O'xshashi taklif qilindi", icon: "≈", badge: "bg-amber-50 text-amber-900 ring-amber-200" },
};

const SERIES_BLUE = "#2a78d6";

export function Badge({ icon, label, cls }: { icon: string; label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cls}`}>
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

export function Card({ title, subtitle, children, className = "" }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-neutral-200 bg-white p-5 ${className}`}>
      <div className="mb-4">
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-neutral-500">{subtitle}</p>}
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
}: {
  label: string;
  value: string;
  sub?: string;
  status?: RequestStatusName;
  flash?: boolean;
}) {
  const s = status ? STATUS[status] : null;
  return (
    <div className={`rounded-2xl border bg-white p-5 transition-colors duration-700 ${flash ? "border-sky-300 bg-sky-50" : "border-neutral-200"}`}>
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        {s && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: s.fill }} aria-hidden>
            {s.icon}
          </span>
        )}
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-sm text-neutral-500">{sub}</div>}
    </div>
  );
}

/** Kategoriyalar: holatlar bo'yicha bo'lingan gorizontal ustunlar (segmentlar orasida 2px oraliq) */
export function CategoryBars({ items }: { items: CategoryStat[] }) {
  const max = Math.max(1, ...items.map((c) => c.total));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs text-neutral-600">
        {(Object.keys(STATUS) as RequestStatusName[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS[k].fill }} />
            {STATUS[k].label}
          </span>
        ))}
      </div>
      {items.length === 0 && <Empty />}
      {items.map((c) => (
        <div key={c.name} className="group relative">
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              {c.name}
              {!c.inCatalog && <span className="rounded bg-red-50 px-1.5 text-[11px] text-red-700">do&apos;konda yo&apos;q</span>}
            </span>
            <span className="tabular-nums text-neutral-600">{c.total}</span>
          </div>
          <div className="flex h-3 gap-[2px]" style={{ width: `${(c.total / max) * 100}%` }}>
            {(Object.keys(STATUS) as RequestStatusName[])
              .filter((k) => c[k] > 0)
              .map((k, i, arr) => (
                <div
                  key={k}
                  className={i === arr.length - 1 ? "rounded-r" : ""}
                  style={{ flexGrow: c[k], background: STATUS[k].fill }}
                />
              ))}
          </div>
          <div className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow-lg group-hover:block">
            <div className="mb-1 font-medium">{c.name}</div>
            {(Object.keys(STATUS) as RequestStatusName[]).map((k) => (
              <div key={k} className="flex justify-between gap-4">
                <span>{STATUS[k].icon} {STATUS[k].label}</span>
                <span className="tabular-nums">{c[k]}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Bitta qatorli kattalik ro'yxati: bir xil ko'k rang, son yonida yozilgan */
export function BarList({ items, swatches = false }: { items: { name: string; count: number }[]; swatches?: boolean }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (items.length === 0) return <Empty />;
  return (
    <div className="space-y-3">
      {items.map((i) => (
        <div key={i.name} title={`${i.name}: ${i.count} ta so'rov`}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              {swatches && <span className="h-3 w-3 rounded-full border border-neutral-300" style={{ background: colorHex(i.name) }} />}
              {i.name}
            </span>
            <span className="tabular-nums text-neutral-600">{i.count}</span>
          </div>
          <div className="h-2 rounded-r" style={{ width: `${(i.count / max) * 100}%`, background: SERIES_BLUE }} />
        </div>
      ))}
    </div>
  );
}

export function Empty() {
  return <p className="py-4 text-sm text-neutral-400">Hozircha ma&apos;lumot yo&apos;q</p>;
}

export function timeAgo(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "hozirgina";
  if (min < 60) return `${min} daq oldin`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} soat oldin`;
  return `${Math.round(h / 24)} kun oldin`;
}
