"use client";

import { useTransition } from "react";
import { deleteProductAction } from "@/app/admin/actions";

export function DeleteButton({ id, name }: { id: number; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm(`"${name}" o'chirilsinmi?`)) startTransition(() => deleteProductAction(id));
      }}
      className="text-danger hover:underline disabled:opacity-50"
    >
      {pending ? "..." : "O'chirish"}
    </button>
  );
}
