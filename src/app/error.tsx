"use client";

import { useEffect } from "react";

// Kutilmagan server xatosi (ko'pincha: ma'lumotlar bazasi o'chiq). Tushunarsiz texnik xabar o'rniga yo'l-yo'riq.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const db = /prisma|database|connect|ECONNREFUSED/i.test(error.message);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">{db ? "Ma'lumotlar bazasiga ulanib bo'lmadi" : "Kutilmagan xato yuz berdi"}</h1>
      <p className="text-neutral-600">
        {db ? (
          <>
            Lokal baza ishlamayotgan bo&apos;lishi mumkin. Yangi terminalda <code className="rounded bg-neutral-100 px-1">npm run db:start</code>{" "}
            ni ishga tushiring, keyin qayta urinib ko&apos;ring.
          </>
        ) : (
          <>
            Sahifani qayta yuklab ko&apos;ring. Lokal ishlatayotgan bo&apos;lsangiz, baza yoqilganini tekshiring (
            <code className="rounded bg-neutral-100 px-1">npm run db:start</code>), keyin server oynasidagi yozuvlarga qarang.
          </>
        )}
      </p>
      <button onClick={retry} className="w-fit rounded-xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white hover:bg-neutral-700">
        Qayta urinish
      </button>
    </main>
  );
}
