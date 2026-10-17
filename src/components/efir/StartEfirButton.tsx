"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Yangi jonli efir xonasini ochib, unga o'tadi (do'stga havola yoki QR xonaning o'zida ko'rsatiladi) */
export function StartEfirButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/efir", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.code) throw new Error(data.error ?? `Xato (${res.status})`);
      router.push(`/efir/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Efir ochilmadi");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={start}
        disabled={busy}
        className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-60"
      >
        {busy ? "Ochilmoqda..." : "● Do'st bilan jonli efir"}
      </button>
      {error && <span className="mt-1 text-xs text-red-600">{error}</span>}
    </div>
  );
}
