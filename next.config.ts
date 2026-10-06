import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// Kompyuterning hozirgi tarmoq manzillari (Wi-Fi, LAN, mobil hotspot): telefon shu manzil orqali ochadi
const localAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);

const nextConfig: NextConfig = {
  // Dev rejimidagi "N" belgisi xaridor ekranidagi tugmalarni yopib qo'ymasligi uchun
  devIndicators: false,
  // Hakamlar telefondan (lokal Wi-Fi, IP manzil orqali) ochganda dev server so'rovlarni bloklamasin.
  // Aks holda sahifa ochiladi, lekin tugmalar ishlamaydi (JS va HMR 403 bilan to'xtatiladi)
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", ...localAddresses],
};

export default nextConfig;
