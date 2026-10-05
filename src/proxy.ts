import { NextResponse, type NextRequest } from "next/server";

// /admin va do'kon paneli uchun oddiy Basic Auth. Login istalgan, parol: ADMIN_PASSWORD.
export function proxy(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("ADMIN_PASSWORD sozlanmagan", { status: 503 });
    }
    return NextResponse.next(); // dev rejimida parolsiz ham ochiladi
  }

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (given === password) return NextResponse.next();
  }

  return new NextResponse("Parol kerak", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="SI Stilist admin", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/panel", "/panel/:path*", "/api/panel", "/api/panel/:path*"],
};
