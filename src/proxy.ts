import { NextResponse, type NextRequest } from "next/server";
import { adminGuard } from "@/lib/admin-auth";

// /admin va do'kon paneli uchun Basic Auth. Login istalgan, parol: ADMIN_PASSWORD.
// Amallar (server action, API) o'z ichida ham qayta tekshiradi: src/lib/admin-auth.ts
export function proxy(request: NextRequest) {
  return adminGuard(request) ?? NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/panel", "/panel/:path*", "/api/panel", "/api/panel/:path*"],
};
