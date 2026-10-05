// Bir buyruqda lokal muhitni tayyorlash (Windows, macOS, Linux):
//   1) .env yo'q bo'lsa .env.example'dan nusxa oladi
//   2) Prisma'ning lokal PostgreSQL serverini fonda ishga tushiradi (Docker shart emas)
//   3) migratsiyalar va demo tovarlarni yuklaydi
import { copyFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  console.log(".env yaratildi (.env.example nusxasi)");
}

run("npm run db:start");
run("npm run db:setup");
console.log("\nTayyor. Endi: npm run dev  ->  http://localhost:3000");
