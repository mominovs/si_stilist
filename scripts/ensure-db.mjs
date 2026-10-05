// `npm run dev` / `npm start` dan oldin: lokal baza (prisma dev, port 5121x) o'chiq bo'lsa, uni yoqadi.
// Docker yoki onlayn baza ishlatilsa hech narsa qilmaydi.
import "dotenv/config";
import { execSync } from "node:child_process";
import net from "node:net";

const url = process.env.DATABASE_URL ?? "";
const match = url.match(/localhost:(5121\d)\//);

function reachable(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port, timeout: 1000 });
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("timeout", () => (socket.destroy(), resolve(false)));
    socket.once("error", () => resolve(false));
  });
}

if (match && !(await reachable(Number(match[1])))) {
  console.log("Lokal baza o'chiq, ishga tushirilmoqda...");
  try {
    execSync("npm run db:start", { stdio: "inherit" });
  } catch {
    console.log("Bazani yoqib bo'lmadi. Qo'lda: npm run db:start");
  }
}
