import assert from "node:assert/strict";
import { test } from "node:test";
import { preferLanAddress, shopperUrl } from "./lan";

test("LAN_IP Wi-Fi manzilini VPN va virtual adapterlardan oldinga o'tkazadi", () => {
  const addresses = ["192.168.56.1", "10.10.8.24", "192.168.88.35"];
  assert.deepEqual(preferLanAddress(addresses, " 192.168.88.35 "), [
    "192.168.88.35", "192.168.56.1", "10.10.8.24",
  ]);
  assert.deepEqual(addresses, ["192.168.56.1", "10.10.8.24", "192.168.88.35"]);
});

test("eskirgan LAN_IP QR ga kirmaydi, ogohlantirish va avtomatik tanlash ishlaydi", (t) => {
  const warning = t.mock.method(console, "warn", () => {});
  const addresses = ["192.168.88.35", "10.10.8.24"];
  assert.deepEqual(preferLanAddress(addresses, "192.168.137.1"), addresses);
  assert.equal(warning.mock.callCount(), 1);
  preferLanAddress(addresses, "192.168.137.1");
  assert.equal(warning.mock.callCount(), 1, "bir manzil uchun bir marta ogohlantiriladi");
  assert.match(String(warning.mock.calls[0].arguments[0]), /LAN_IP=192\.168\.137\.1/);
});

test("LAN_IP berilmasa avtomatik manzillar tartibi saqlanadi", () => {
  const addresses = ["192.168.88.35", "10.10.8.24"];
  assert.deepEqual(preferLanAddress(addresses), addresses);
  assert.deepEqual(preferLanAddress(addresses, " "), addresses);
});

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
