// Lokal HTTPS (bir Wi-Fi yoki kompyuter hotspoti): telefon brauzeri jonli kamerani faqat HTTPS'da beradi.
// https://<kompyuter-IP>:3443 -> http://127.0.0.1:3000 (npm start). Internet kerak emas, kadrlar tarmoqdan
// chiqmaydi. Sertifikat shu kompyuterda yaratiladi (certificates/lan/), shuning uchun telefon birinchi marta
// "ulanish xavfsiz emas" deydi: Qo'shimcha -> Baribir o'tish.
//   node scripts/https-proxy.mjs        (run-local.bat ishga tushiradi)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { networkInterfaces } from "node:os";
import path from "node:path";
import QRCode from "qrcode";
import selfsigned from "selfsigned";

const PORT = Number(process.env.LAN_HTTPS_PORT || 3443);
const TARGET = Number(process.env.PORT || 3000);
const DIR = path.join(process.cwd(), "certificates", "lan");

/** Tarmoq IPv4 manzillari (src/lib/lan.ts dagi bilan bir xil tartib: virtual adapterlar oxirida) */
function lanIps() {
  const virtual = /vethernet|virtual|vmware|vbox|docker|wsl|hyper-v|tailscale|zerotier|loopback/i;
  const found = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const info of list ?? []) {
      if (info.family !== "IPv4" || info.internal) continue;
      const privateNet = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(info.address);
      found.push({ address: info.address, score: (virtual.test(name) ? 2 : 0) + (privateNet ? 0 : 1) });
    }
  }
  return found.sort((a, b) => a.score - b.score).map((f) => f.address);
}

/** Sertifikat: localhost + hozirgi IP'lar. Yangi IP paydo bo'lsa (boshqa Wi-Fi, hotspot) qayta yaratiladi */
function certificate(ips) {
  const meta = path.join(DIR, "ips.json");
  const keyFile = path.join(DIR, "key.pem");
  const certFile = path.join(DIR, "cert.pem");
  try {
    const known = JSON.parse(readFileSync(meta, "utf8"));
    if (existsSync(keyFile) && existsSync(certFile) && ips.every((ip) => known.includes(ip))) {
      return { key: readFileSync(keyFile), cert: readFileSync(certFile) };
    }
  } catch {
    // birinchi marta
  }
  const altNames = [{ type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }, ...ips.map((ip) => ({ type: 7, ip }))];
  const pems = selfsigned.generate([{ name: "commonName", value: "SI Stilist lokal" }], {
    keySize: 2048,
    days: 825,
    algorithm: "sha256",
    extensions: [{ name: "subjectAltName", altNames }],
  });
  mkdirSync(DIR, { recursive: true });
  writeFileSync(keyFile, pems.private);
  writeFileSync(certFile, pems.cert);
  writeFileSync(meta, JSON.stringify(ips));
  console.log(`Sertifikat yaratildi: ${ips.join(", ") || "faqat localhost"}`);
  return { key: pems.private, cert: pems.cert };
}

const ips = lanIps();
const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });

const server = https.createServer(certificate(ips), (req, res) => {
  const headers = {
    ...req.headers,
    "x-forwarded-proto": "https",
    "x-forwarded-host": req.headers.host ?? "",
    "x-forwarded-for": (req.socket.remoteAddress ?? "").replace(/^::ffff:/, ""),
  };
  const upstream = http.request(
    { host: "127.0.0.1", port: TARGET, method: req.method, path: req.url, headers, agent },
    (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end("Sayt hali ishga tushmagan: biroz kuting va sahifani yangilang.");
  });
  req.pipe(upstream);
});

server.on("error", (e) => {
  console.log(e.code === "EADDRINUSE" ? `XATO: ${PORT}-port band (eski oyna ochiq qolgan bo'lishi mumkin).` : `XATO: ${e.message}`);
  process.exit(1);
});

server.listen(PORT, "0.0.0.0", async () => {
  console.log(`\nLokal HTTPS ishlayapti (sayt: http://localhost:${TARGET}).`);
  if (!ips.length) {
    console.log("Tarmoq topilmadi: Wi-Fi'ga ulaning yoki kompyuter hotspotini yoqing, keyin shu oynani qayta ishga tushiring.");
    return;
  }
  for (const ip of ips) console.log(`  Telefon uchun: https://${ip}:${PORT}/   jonli oyna: https://${ip}:${PORT}/oyna`);
  const url = `https://${ips[0]}:${PORT}/`;
  console.log(`\nTelefon kamerasini QR kodga qarating (${url}):`);
  console.log(await QRCode.toString(url, { type: "terminal", small: true }));
  console.log("Telefon \"Ulanish xavfsiz emas\" desa: Qo'shimcha (Advanced) -> Baribir o'tish (Proceed).");
});
