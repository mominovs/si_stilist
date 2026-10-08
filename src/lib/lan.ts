import { networkInterfaces } from "node:os";

/**
 * Kompyuterning lokal tarmoqdagi IPv4 manzillari (Wi-Fi/LAN). Hakamlar telefondan shu manzil orqali
 * xaridor sahifasini ochadi. Virtual adapterlar (Docker, WSL, VPN) oxiriga suriladi.
 */
export function lanAddresses(): string[] {
  const virtual = /vethernet|virtual|vmware|vbox|docker|wsl|hyper-v|tailscale|zerotier|loopback/i;
  const found: { address: string; score: number }[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const info of list ?? []) {
      if (info.family !== "IPv4" || info.internal) continue;
      const privateNet = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(info.address);
      found.push({ address: info.address, score: (virtual.test(name) ? 2 : 0) + (privateNet ? 0 : 1) });
    }
  }
  return found.sort((a, b) => a.score - b.score).map((f) => f.address);
}

/**
 * Telefondan ochiladigan xaridor sahifasi manzili. Host sarlavhasidan port, x-forwarded-proto dan protokol olinadi
 * (telefonda jonli kamera faqat HTTPS'da ishlaydi).
 *  - sahifa tarmoq yoki ngrok manzili orqali ochilgan bo'lsa: aynan o'sha manzil (port bo'lsa porti bilan)
 *  - localhost'dan ochilgan, lokal HTTPS proksi ishlayotgan bo'lsa (run-local.bat, LAN_HTTPS_PORT): https://IP:3443
 *  - aks holda shu port bilan tarmoq IP manzili
 */
export function shopperUrl(
  host: string | null,
  proto: string | null = "http",
  lanHttpsPort: string | undefined = process.env.LAN_HTTPS_PORT,
): string | null {
  const scheme = proto === "https" ? "https" : "http";
  const hostname = host?.replace(/:\d+$/, "") ?? "";
  if (hostname && !/^(localhost|127\.|\[?::1\]?$)/.test(hostname)) return `${scheme}://${host}/`;
  const ip = lanAddresses()[0];
  if (!ip) return null;
  if (lanHttpsPort) return `https://${ip}:${lanHttpsPort}/`;
  return `${scheme}://${ip}:${host?.match(/:(\d+)$/)?.[1] ?? "3000"}/`;
}
