// Admin, do'kon paneli va ularning amallari uchun Basic Auth tekshiruvi. Login istalgan, parol: ADMIN_PASSWORD.
// proxy.ts yo'l darajasida, server action va route handler'lar esa o'z ichida qayta tekshiradi
// (proxy matcher'i o'zgarsa yoki chetlab o'tilsa ham amallar himoyasiz qolmasin).

import { timingSafeEqual } from "node:crypto";

export type AuthResult = "ok" | "denied" | "not-configured";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkAdminAuth(authorization: string | null): AuthResult {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    // Dev rejimida parolsiz ham ochiladi, production'da esa yopiq
    return process.env.NODE_ENV === "production" ? "not-configured" : "ok";
  }
  if (!authorization?.startsWith("Basic ")) return "denied";
  let decoded = "";
  try {
    decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
  } catch {
    return "denied";
  }
  const given = decoded.slice(decoded.indexOf(":") + 1);
  return safeEqual(given, password) ? "ok" : "denied";
}

/** Server action ichida: ruxsat bo'lmasa xato tashlaydi */
export async function requireAdmin(): Promise<void> {
  const { headers } = await import("next/headers");
  if (checkAdminAuth((await headers()).get("authorization")) !== "ok") {
    throw new Error("Ruxsat yo'q: admin paroli kerak");
  }
}

/** Route handler ichida: ruxsat bo'lmasa 401 javob qaytaradi, bo'lsa null */
export function adminGuard(request: Request): Response | null {
  const result = checkAdminAuth(request.headers.get("authorization"));
  if (result === "ok") return null;
  if (result === "not-configured") return new Response("ADMIN_PASSWORD sozlanmagan", { status: 503 });
  return new Response("Parol kerak", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="SI Stilist admin", charset="UTF-8"' },
  });
}
