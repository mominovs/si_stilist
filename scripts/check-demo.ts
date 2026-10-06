// Demo oldidan tekshiruv (brauzerdagi /admin/holat sahifasi bilan bir xil):
//   npm run check:demo
// Baza, SI kaliti va internet, kiyintirish serveri, tayyor demo natijalari, tovar rasmlari, admin paroli.

import "dotenv/config";
import { prisma } from "../src/lib/db";
import { runChecks } from "../src/lib/health";
import { lanAddresses } from "../src/lib/lan";

const ICON = { ok: "[ OK ]", warn: "[DIQQAT]", fail: "[XATO]" } as const;

async function main() {
  const checks = await runChecks();
  console.log("\nSI Stilist: demo holati\n");
  for (const c of checks) {
    console.log(`${ICON[c.status].padEnd(8)} ${c.title}: ${c.detail}`);
    if (c.hint && c.status !== "ok") console.log(`         -> ${c.hint}`);
  }
  const ip = lanAddresses()[0];
  console.log(`\nTelefondan: ${ip ? `http://${ip}:3000/` : "Wi-Fi manzili topilmadi"}`);
  console.log("Batafsil va zaxira rejimlar: http://localhost:3000/admin/holat\n");
  await prisma.$disconnect().catch(() => {});
  process.exit(checks.some((c) => c.status === "fail") ? 1 : 0);
}

main();
