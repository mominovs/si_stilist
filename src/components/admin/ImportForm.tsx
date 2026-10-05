"use client";

import { useActionState } from "react";
import { importCsvAction, type ImportState } from "@/app/admin/actions";

export function ImportForm() {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importCsvAction, {});

  return (
    <div className="space-y-4">
      <form action={formAction} className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-white p-5">
        <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
        <button disabled={pending} className="rounded-lg bg-neutral-900 px-5 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50">
          {pending ? "Import qilinmoqda..." : "Import qilish"}
        </button>
      </form>

      {state.message && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.message}</div>
      )}

      {state.done && (
        <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5 text-sm">
          <div className="flex flex-wrap gap-6">
            <span>Yangi: <b>{state.created}</b></span>
            <span>Yangilandi: <b>{state.updated}</b></span>
            <span className={state.rowErrors?.length ? "text-red-600" : ""}>Xato qatorlar: <b>{state.rowErrors?.length ?? 0}</b></span>
          </div>
          {state.rowErrors && state.rowErrors.length > 0 && (
            <ul className="space-y-1 text-red-700">
              {state.rowErrors.map((r) => (
                <li key={r.row}>
                  <b>{r.row}-qator:</b> {r.errors.join("; ")}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
