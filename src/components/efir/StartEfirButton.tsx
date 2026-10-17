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
    <div className="flex w-full flex-col items-stretch">
      <button onClick={start} disabled={busy} className="btn btn-primary btn-lg w-full">
        <span className="h-3 w-3 rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,.3)]" />
        {busy ? "Ochilmoqda..." : "Do'st bilan jonli efir"}
      </button>
      {error && <span className="mt-1 text-center text-xs font-semibold text-danger">{error}</span>}
    </div>
  );
}
