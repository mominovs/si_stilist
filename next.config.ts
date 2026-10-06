import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev rejimidagi "N" belgisi xaridor ekranidagi tugmalarni yopib qo'ymasligi uchun
  devIndicators: false,
  // Hakamlar telefondan (lokal Wi-Fi, IP manzil orqali) ochganda dev server so'rovlarni bloklamasin
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
};

export default nextConfig;
