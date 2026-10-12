import assert from "node:assert/strict";
import { test } from "node:test";
import { rankAddresses, shopperUrl } from "./lan";

test("tarmoq yoki ngrok manzili o'zgarmaydi (ngrok'ga port qo'shilmaydi)", () => {
  assert.equal(shopperUrl("abc.ngrok-free.dev", "https"), "https://abc.ngrok-free.dev/");
  assert.equal(shopperUrl("192.168.137.1:3443", "https"), "https://192.168.137.1:3443/");
  assert.equal(shopperUrl("192.168.1.5:3000", "http"), "http://192.168.1.5:3000/");
});

test("localhost: lokal HTTPS proksi bo'lsa telefonga https IP manzili", () => {
  const url = shopperUrl("localhost:3000", "http", "3443");
  // Muhitda tarmoq bo'lmasa null, bo'lsa https://IP:3443
  if (url !== null) assert.match(url, /^https:\/\/[\d.]+:3443\/$/);
  const plain = shopperUrl("localhost:3000", "http", undefined);
  if (plain !== null) assert.match(plain, /^http:\/\/[\d.]+:3000\/$/);
});

test("Windows hotspoti (192.168.137.x) Wi-Fi manzilidan oldin, virtual adapterlar oxirida", () => {
  const ip = (address: string) => [{ family: "IPv4", internal: false, address }];
  const order = rankAddresses({
    "vEthernet (WSL)": ip("172.20.0.1"),
    "Wi-Fi": ip("10.20.30.40"),
    "Local Area Connection* 10": ip("192.168.137.1"),
    lo: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
  });
  assert.deepEqual(order, ["192.168.137.1", "10.20.30.40", "172.20.0.1"]);
});
