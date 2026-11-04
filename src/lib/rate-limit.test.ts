import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { clientKey, rateLimit } from "./rate-limit";

const req = (headers: Record<string, string>) => new Request("http://localhost/api", { headers });

afterEach(() => {
  delete process.env.BEHIND_CLOUDFLARE;
});

test("clientKey: x-forwarded-for dagi birinchi manzil", () => {
  assert.equal(clientKey(req({ "x-forwarded-for": "10.0.0.5, 127.0.0.1" })), "10.0.0.5");
  assert.equal(clientKey(req({})), "local");
});

test("clientKey: cf-connecting-ip faqat BEHIND_CLOUDFLARE=1 da", () => {
  const r = req({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "127.0.0.1" });
  assert.equal(clientKey(r), "127.0.0.1");
  process.env.BEHIND_CLOUDFLARE = "1";
  assert.equal(clientKey(r), "203.0.113.7");
  assert.equal(clientKey(req({ "x-forwarded-for": "10.0.0.9" })), "10.0.0.9");
});

test("rateLimit: chegaradan oshganda rad etadi", () => {
  const key = `test:${Math.random()}`;
  assert.equal(rateLimit(key, 2).ok, true);
  assert.equal(rateLimit(key, 2).ok, true);
  const third = rateLimit(key, 2);
  assert.equal(third.ok, false);
  assert.ok(third.retryAfterSec > 0);
});
