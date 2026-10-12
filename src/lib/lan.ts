import { networkInterfaces } from "node:os";

type NetInfo = { family: string | number; internal: boolean; address: string };

/**
 * Manzillarni telefon uchun qulaylik tartibida saralaydi. Windows mobil hotspoti (192.168.137.x) birinchi:
 * kompyuter bir vaqtda Wi-Fi'ga ham ulangan bo'lsa, hotspotdagi telefonlar faqat shu manzilni ko'radi
 * (universitet Wi-Fi'larida qurilmalar ko'pincha bir-biridan ajratilgan). Virtual adapterlar (Docker, WSL, VPN)
 * va xususiy bo'lmagan manzillar oxiriga suriladi.
 */
export function rankAddresses(interfaces: Record<string, NetInfo[] | undefined>): string[] {
  const virtual = /vethernet|virtual|vmware|vbox|docker|wsl|hyper-v|tailscale|zerotier|loopback/i;
  const found: { address: string; score: number }[] = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const info of list ?? []) {
      if ((info.family !== "IPv4" && info.family !== 4) || info.internal) continue;
      const hotspot = info.address.startsWith("192.168.137.");
      const privateNet = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(info.address);
      const score = hotspot ? -1 : (virtual.test(name) ? 2 : 0) + (privateNet ? 0 : 1);
      found.push({ address: info.address, score });
    }
  }
  return found.sort((a, b) => a.score - b.score).map((f) => f.address);
}

/** Kompyuterning lokal tarmoqdagi IPv4 manzillari: hakamlar telefondan shu manzil orqali sahifani ochadi */
export function lanAddresses(): string[] {
  return rankAddresses(networkInterfaces());
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
