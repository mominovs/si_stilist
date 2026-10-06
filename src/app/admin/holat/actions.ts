"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { demoSettings, type DemoSettings } from "@/lib/demo-settings";

/** Zaxira rejimni yoqish/o'chirish. /admin ostida: Basic Auth bilan himoyalangan */
export async function toggleDemoSetting(formData: FormData) {
  await requireAdmin();
  const key = String(formData.get("key")) as keyof DemoSettings;
  if (key !== "llmOff" && key !== "tryOnDemo") return;
  demoSettings[key] = formData.get("value") === "on";
  console.log(`[demo] ${key} = ${demoSettings[key]}`);
  refresh();
}
